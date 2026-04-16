import React, { useState, useEffect } from 'react';
import { Download, PlusCircle, Trash2, ClipboardList, HardHat, Keyboard, Calendar, ExternalLink, Settings, X, Edit3, Table, Sparkles, FileText, Loader2 } from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';

// --- SAFE FIREBASE INITIALIZATION ---
let app, auth, db;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

try {
  // Safely handles both stringified and direct object configurations
  let firebaseConfig = typeof __firebase_config !== 'undefined' ? __firebase_config : {};
  if (typeof firebaseConfig === 'string') {
    firebaseConfig = JSON.parse(firebaseConfig);
  }

  if (Object.keys(firebaseConfig).length > 0) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (error) {
  console.error("Firebase Initialization Error:", error);
}

// --- GEMINI API HELPER ---
const callGeminiAPI = async (systemInstruction, userText, expectJson = false) => {
  const apiKey = "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: userText }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
  };

  if (expectJson) {
    payload.generationConfig = { responseMimeType: "application/json" };
  }

  const delays = [1000, 2000, 4000, 8000, 16000];
  for (let i = 0; i < delays.length + 1; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (error) {
      if (i === delays.length) throw error;
      await new Promise(resolve => setTimeout(resolve, delays[i]));
    }
  }
};

export default function App() {
  const [records, setRecords] = useState([]);

  const DEFAULT_MATERIALS = ['Contact Wire', 'Catenary Wire', 'Dropper Wire', 'Jumper Wire'];
  const DEFAULT_UNITS = ['Meters', "No's", 'kg', 'g', 'Ltr', 'ml', 'set'];
  const DEFAULT_STAFF = [
    'SHAMBHU PRASAD (Sr. Tech)', 'ABHISHEK KUMAR (Sr. Tech)', 'VIJAY KUMAR (Sr. Tech)',
    'ABHIJEET KUMAR (Tech I)', 'SUNIL KUMAR (Tech I)', 'KUMAR GAURAV ( Tech II)',
    'JULI KUMARI (Tech II)', 'RAJEEV KUMAR JHA ( Tech II)', 'SAURABH KUMAR ( Tech II)',
    'SUNIL KUMAR ( Tech II)', 'PINTU KUMAR (Tech III)', 'VISHAM KUMAR ( Tech III)',
    'VIJAY KUMAR ( Tech III)', 'AMIT MEHTAR ( Tech III)', 'SAMIT GORAI ( Tech III)',
    'SUBODH KUMAR MEHTA ( Tech III)', 'KUNADAN KUMAR ( Tech III)', 'MURLI MANOHAR JOSHI ( Tech III)',
    'OMKAR ANAND ( Tech III)', 'CHANDAN KUMAR (JE)', 'CHANDAN KUMAR ( Assistant)',
    'RAKESH KUMAR ( Assistant)', 'BIRENDRA KUMAR ( Assistant)', 'RAJNISH KUMAR ( Assistant)'
  ];

  const [materialsList, setMaterialsList] = useState(DEFAULT_MATERIALS);
  const [unitsList, setUnitsList] = useState(DEFAULT_UNITS);
  const [staffList, setStaffList] = useState(DEFAULT_STAFF);

  const [isManualDate, setIsManualDate] = useState(true);
  const [isMaterialFocused, setIsMaterialFocused] = useState(false);
  const [isStaffFocused, setIsStaffFocused] = useState(false);
  const [isUnitFocused, setIsUnitFocused] = useState(false);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    materialName: '',
    quantity: '',
    unit: 'Meters',
    location: '',
    staffName: ''
  });

  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [user, setUser] = useState(null);

  const [showSettings, setShowSettings] = useState(false);
  const [scriptUrl, setScriptUrl] = useState('https://script.google.com/macros/s/AKfycbxSHtyqZkdkC0nvSRCEBLebHOCcY3FVtVWRMbH8Yy6LFQ1_A4Y52lVarqM-nPIg8pZM/exec');
  const [sheetName, setSheetName] = useState('Sheet1');

  const [viewMode, setViewMode] = useState('current');

  const [smartText, setSmartText] = useState("");
  const [isSmartLoading, setIsSmartLoading] = useState(false);
  const [reportText, setReportText] = useState("");
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const defaultHeaders = {
    sno: 'S. No.',
    date: 'Date',
    materialName: 'Material Name',
    quantity: 'Quantity',
    unit: 'Unit',
    location: 'Location',
    staffName: 'Staff Name'
  };

  const [headers, setHeaders] = useState(defaultHeaders);
  const [tempSettings, setTempSettings] = useState({
    scriptUrl: 'https://script.google.com/macros/s/AKfycbxSHtyqZkdkC0nvSRCEBLebHOCcY3FVtVWRMbH8Yy6LFQ1_A4Y52lVarqM-nPIg8pZM/exec',
    sheetName: 'Sheet1',
    headers: defaultHeaders
  });

  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) { console.error("Auth error:", e); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config');
    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setScriptUrl(data.googleScriptUrl || 'https://script.google.com/macros/s/AKfycbxSHtyqZkdkC0nvSRCEBLebHOCcY3FVtVWRMbH8Yy6LFQ1_A4Y52lVarqM-nPIg8pZM/exec');
        setSheetName(data.sheetName || 'Sheet1');
        if (data.customHeaders) {
          setHeaders(data.customHeaders);
        }
        setTempSettings({
          scriptUrl: data.googleScriptUrl || 'https://script.google.com/macros/s/AKfycbxSHtyqZkdkC0nvSRCEBLebHOCcY3FVtVWRMbH8Yy6LFQ1_A4Y52lVarqM-nPIg8pZM/exec',
          sheetName: data.sheetName || 'Sheet1',
          headers: data.customHeaders || defaultHeaders
        });
      }
    });

    const recordsRef = collection(db, 'artifacts', appId, 'public', 'data', 'records');
    const unsubscribe = onSnapshot(recordsRef, (snapshot) => {
      const fetchedRecords = [];
      const dbMaterials = new Set(DEFAULT_MATERIALS);
      const dbUnits = new Set(DEFAULT_UNITS);
      const dbStaff = new Set(DEFAULT_STAFF);

      snapshot.forEach(doc => {
        const d = doc.data();
        fetchedRecords.push({ ...d, id: doc.id });
        if (d.materialName) dbMaterials.add(d.materialName);
        if (d.unit) dbUnits.add(d.unit);
        if (d.staffName) dbStaff.add(d.staffName);
      });

      setMaterialsList(Array.from(dbMaterials));
      setUnitsList(Array.from(dbUnits));
      setStaffList(Array.from(dbStaff));

      fetchedRecords.sort((a, b) => {
        const parseDate = (s) => {
          if (!s) return 0;
          if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
            const [day, month, year] = s.split('-');
            return new Date(`${year}-${month}-${day}`).getTime();
          }
          return new Date(s).getTime() || 0;
        };
        const tA = parseDate(a.date);
        const tB = parseDate(b.date);
        return tA !== tB ? tB - tA : (b.timestamp || 0) - (a.timestamp || 0);
      });
      setRecords(fetchedRecords);
    }, (e) => setErrorMessage("Sync error. Check database permissions."));

    return () => { unsubscribe(); unsubSettings(); };
  }, [user]);

  const displayedRecords = viewMode === 'all' ? records : records.filter(r => (r.sheetName || 'Sheet1') === sheetName);

  const handleSmartEntry = async () => {
    if (!smartText.trim()) return;
    setIsSmartLoading(true);
    setErrorMessage("");
    try {
      const sysPrompt = `You are a data extraction assistant for a railway OHE (Overhead Equipment) material tracker. 
      Read the user's natural language input and extract the details into a JSON object with these exact keys:
      - "date": YYYY-MM-DD format. If the text says "today", use ${new Date().toISOString().split('T')[0]}. If unspecified, return empty string.
      - "materialName": Extract the material name (e.g., "Contact Wire", "Catenary Wire").
      - "quantity": Extract just the number.
      - "unit": Extract the unit (e.g., "Meters", "kg", "No's").
      - "location": Extract the location mentioned (e.g., "KM 124/5").
      - "staffName": Extract the staff member's name.
      Return ONLY a valid JSON object. If a field is missing in the text, leave the value as an empty string.`;

      const responseText = await callGeminiAPI(sysPrompt, smartText, true);
      if (!responseText) throw new Error("Empty AI Response");

      const data = JSON.parse(responseText);

      setFormData(prev => ({
        ...prev,
        date: data.date || prev.date,
        materialName: data.materialName || prev.materialName,
        quantity: data.quantity || prev.quantity,
        unit: data.unit || prev.unit,
        location: data.location || prev.location,
        staffName: data.staffName || prev.staffName
      }));
      setSmartText("");
    } catch (e) {
      console.error(e);
      setErrorMessage("Could not parse the text. Please try again or enter manually.");
    } finally {
      setIsSmartLoading(false);
    }
  };

  const generateReport = async () => {
    if (displayedRecords.length === 0) return;
    setShowReportModal(true);
    setIsReportLoading(true);
    try {
      const dataToAnalyze = displayedRecords.slice(0, 20).map(r =>
        `Date: ${r.date}, Staff: ${r.staffName}, Material: ${r.quantity} ${r.unit} of ${r.materialName}, Location: ${r.location}`
      ).join('\n');

      const sysPrompt = `You are an expert site manager reviewing OHE railway material logs.
      Review the provided recent records and write a professional, engaging 2-to-3 paragraph executive summary of the site activity.
      Highlight the main materials consumed, who the most active staff were, and what locations were worked on. 
      Use formatting like bullet points or bold text to make it easy to read.`;

      const response = await callGeminiAPI(sysPrompt, `Here are the latest records:\n${dataToAnalyze}`);
      setReportText(response || "Summary generated perfectly, but no text was returned.");
    } catch (e) {
      console.error(e);
      setReportText("An error occurred while generating the report. Please try again.");
    } finally {
      setIsReportLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const newRecordId = Date.now().toString();
    const newRecord = { ...formData, timestamp: Date.now(), submittedBy: user?.uid || 'anonymous_user', sheetName: sheetName, id: newRecordId };

    try {
      if (user && db) {
        const recordsRef = collection(db, 'artifacts', appId, 'public', 'data', 'records');
        const addedDocRef = await addDoc(recordsRef, newRecord);
        newRecord.id = addedDocRef.id;
      } else {
        // Fallback if not logged into Firebase: simply update local UI state immediately
        setRecords(prev => [newRecord, ...prev]);
      }

      if (scriptUrl) {
        const params = new URLSearchParams({
          action: 'add',
          sheetName: sheetName,
          id: newRecord.id,
          date: formData.date,
          materialName: formData.materialName,
          quantity: formData.quantity,
          unit: formData.unit,
          location: formData.location,
          staffName: formData.staffName,
          h_sno: headers.sno,
          h_date: headers.date,
          h_mat: headers.materialName,
          h_qty: headers.quantity,
          h_unit: headers.unit,
          h_loc: headers.location,
          h_staff: headers.staffName
        }).toString();
        fetch(`${scriptUrl}?${params}`, { method: 'GET', mode: 'no-cors' }).catch(e => console.error("Sheet Sync:", e));
      }

      setFormData(prev => ({ ...prev, materialName: '', quantity: '', location: '', staffName: '' }));
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (e) {
      console.error(e);
      setErrorMessage("Failed to save record.");
    }
  };

  const handleDelete = async (id) => {
    try {
      const recordToDelete = records.find(r => r.id === id);
      const targetSheet = recordToDelete ? (recordToDelete.sheetName || 'Sheet1') : sheetName;

      if (user && db) {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'records', id));
      } else {
        setRecords(prev => prev.filter(r => r.id !== id));
      }

      if (scriptUrl) {
        const params = new URLSearchParams({ action: 'delete', id: id, sheetName: targetSheet }).toString();
        fetch(`${scriptUrl}?${params}`, { method: 'GET', mode: 'no-cors' }).catch(e => console.error("Delete Sync:", e));
      }
    } catch (e) {
      console.error(e);
      setErrorMessage("Delete error.");
    }
  };

  const exportToCSV = () => {
    if (displayedRecords.length === 0) return;

    const isConsolidated = viewMode === 'all';
    const csvHeaders = [headers.sno, headers.date, isConsolidated ? "Source Sheet" : null, headers.materialName, headers.quantity, headers.unit, headers.location, headers.staffName].filter(Boolean);

    const dataRows = displayedRecords.map((r, i) => {
      const row = [`"${i + 1}"`, `"${r.date || ''}"`];
      if (isConsolidated) row.push(`"${r.sheetName || 'Sheet1'}"`);
      row.push(`"${r.materialName || ''}"`, `"${r.quantity || ''}"`, `"${r.unit || ''}"`, `"${r.location || ''}"`, `"${r.staffName || ''}"`);
      return row;
    });

    const csvString = [csvHeaders.map(h => `"${h}"`).join(","), ...dataRows.map(row => row.join(","))].join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `OHE_Data_${isConsolidated ? 'Consolidated' : sheetName}.csv`;
    link.click();
    window.open('https://docs.google.com/spreadsheets/d/1x2sp1fMGTmcEzWZxZ_rFbBrtoMlvwtSwyJ44RUEBlx8/edit?usp=sharing', '_blank');
  };

  const saveSettings = async () => {
    try {
      // 1. If Firebase happens to be active, save it there for cross-device syncing
      if (db) {
        const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config');
        await setDoc(settingsRef, {
          googleScriptUrl: tempSettings.scriptUrl,
          sheetName: tempSettings.sheetName,
          customHeaders: tempSettings.headers
        }, { merge: true });
      }

      // 2. ALWAYS update the local memory state so the app instantly feels the change
      setScriptUrl(tempSettings.scriptUrl);
      setSheetName(tempSettings.sheetName);
      setHeaders(tempSettings.headers);

      // 3. Close the settings modal
      setShowSettings(false);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-800">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* App Header */}
        <div className="bg-blue-600 text-white p-6 rounded-2xl shadow-lg flex items-center space-x-4">
          <HardHat className="w-10 h-10 text-blue-200" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-tight text-white drop-shadow-md">OHE USED MATERIAL DATA COLLECTION LIST</h1>
            <div className="flex items-center text-blue-100 mt-1 text-sm">
              <Table className="w-4 h-4 mr-1" />
              Syncing to: <span className="font-mono bg-blue-700 px-2 py-0.5 rounded ml-1">{sheetName}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column: AI Input & Forms */}
          <div className="lg:col-span-1 space-y-6">

            {/* ✨ AI Smart Input Block */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-5 rounded-2xl shadow-sm border border-indigo-100">
              <h2 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center text-indigo-700">
                <Sparkles className="w-4 h-4 mr-2" /> AI Smart Entry
              </h2>
              <textarea
                value={smartText}
                onChange={(e) => setSmartText(e.target.value)}
                placeholder="E.g., Today Shambhu used 50 meters of contact wire at KM 124/5..."
                className="w-full p-3 bg-white/80 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-400 outline-none text-sm resize-none"
                rows="3"
              />
              <button
                onClick={handleSmartEntry}
                disabled={isSmartLoading || !smartText.trim()}
                className="w-full mt-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium py-2 rounded-xl transition-all flex items-center justify-center text-sm shadow-sm"
              >
                {isSmartLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                ✨ Auto-Fill Form
              </button>
            </div>

            {/* Standard Form */}
            <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-100">
              <h2 className="text-xl font-semibold mb-6 flex items-center text-slate-700">
                <PlusCircle className="w-5 h-5 mr-2 text-blue-500" /> New Entry
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">{headers.date}</label>
                  <div className="flex space-x-2">
                    <input type={isManualDate ? "text" : "date"} name="date" value={formData.date} onChange={handleChange} placeholder="DD-MM-YYYY" className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                    <button type="button" onClick={() => setIsManualDate(!isManualDate)} className="p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-600">
                      {isManualDate ? <Calendar className="w-5 h-5" /> : <Keyboard className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">{headers.materialName}</label>
                  <div className="relative">
                    <input type="text" name="materialName" value={formData.materialName} onChange={handleChange} onFocus={() => setIsMaterialFocused(true)} onBlur={() => setTimeout(() => setIsMaterialFocused(false), 200)} placeholder="Search material..." className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required autoComplete="off" />
                    {isMaterialFocused && formData.materialName && materialsList.filter(m => m.toLowerCase().includes((formData.materialName || "").toLowerCase()) && m !== formData.materialName).length > 0 && (
                      <ul className="absolute z-10 w-full bg-white border border-slate-200 mt-1 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {materialsList.filter(m => m.toLowerCase().includes((formData.materialName || "").toLowerCase()) && m !== formData.materialName).map((m, i) => (
                          <li key={i} onMouseDown={() => setFormData(p => ({ ...p, materialName: m }))} className="p-2.5 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-50">{m}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="flex space-x-2">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-600 mb-1">{headers.quantity}</label>
                    <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                  </div>
                  <div className="w-28 relative">
                    <label className="block text-sm font-medium text-slate-600 mb-1">{headers.unit}</label>
                    <input
                      type="text"
                      name="unit"
                      value={formData.unit}
                      onChange={handleChange}
                      onFocus={(e) => { setIsUnitFocused(true); e.target.select(); }}
                      onBlur={() => setTimeout(() => setIsUnitFocused(false), 200)}
                      placeholder="Type..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      required
                      autoComplete="off"
                    />
                    {isUnitFocused && (
                      <ul className="absolute z-10 w-32 right-0 bg-white border border-slate-200 mt-1 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {(unitsList.includes(formData.unit) ? unitsList : unitsList.filter(u => u.toLowerCase().includes((formData.unit || "").toLowerCase()))).map((u, i) => (
                          <li
                            key={i}
                            onMouseDown={(e) => { e.preventDefault(); setFormData(p => ({ ...p, unit: u })); setIsUnitFocused(false); }}
                            className="p-2.5 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-50 text-slate-700"
                          >
                            {u}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">{headers.location}</label>
                  <input type="text" name="location" value={formData.location} onChange={handleChange} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">{headers.staffName}</label>
                  <div className="relative">
                    <input type="text" name="staffName" value={formData.staffName} onChange={handleChange} onFocus={() => setIsStaffFocused(true)} onBlur={() => setTimeout(() => setIsStaffFocused(false), 200)} placeholder="Search staff..." className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required autoComplete="off" />
                    {isStaffFocused && formData.staffName && staffList.filter(s => s.toLowerCase().includes((formData.staffName || "").toLowerCase()) && s !== formData.staffName).length > 0 && (
                      <ul className="absolute bottom-full mb-1 z-10 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {staffList.filter(s => s.toLowerCase().includes((formData.staffName || "").toLowerCase()) && s !== formData.staffName).map((s, i) => (
                          <li key={i} onMouseDown={() => setFormData(p => ({ ...p, staffName: s }))} className="p-2.5 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-50">{s}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <button type="submit" className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl shadow-md transition-all">Save Record</button>
                {showSuccess && <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm text-center font-medium border border-green-200 mt-2">Saved Successfully!</div>}
                {errorMessage && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm text-center font-medium border border-red-200 mt-2">{errorMessage}</div>}
              </form>
            </div>
          </div>

          {/* Right Column: Records Table */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-md border border-slate-100 flex flex-col min-h-[500px]">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">

              {/* HEADER WITH TOGGLE BUTTONS */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <h2 className="text-xl font-semibold flex items-center text-slate-700">
                  <ClipboardList className="w-5 h-5 mr-2 text-blue-500" />
                  {viewMode === 'all' ? 'Consolidated' : sheetName} Records
                  <span className="ml-3 bg-blue-100 text-blue-700 py-0.5 px-2.5 rounded-full text-xs font-bold">{displayedRecords.length}</span>
                </h2>

                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button onClick={() => setViewMode('current')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'current' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                    {sheetName}
                  </button>
                  <button onClick={() => setViewMode('all')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'all' ? 'bg-white shadow-sm text-purple-600' : 'text-slate-500 hover:text-slate-700'}`}>
                    All Sheets
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button
                  onClick={generateReport}
                  disabled={displayedRecords.length === 0}
                  className="flex items-center justify-center px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                >
                  <FileText className="w-4 h-4 mr-2" /> ✨ Generate Summary
                </button>
                <button onClick={() => setShowSettings(true)} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg"><Settings className="w-5 h-5" /></button>
                <button onClick={exportToCSV} className="flex-1 sm:flex-none flex items-center justify-center px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium"><Download className="w-4 h-4 mr-2" /> Export</button>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs border-b border-slate-100 uppercase tracking-wider">
                    <th className="p-4 font-bold w-12 text-center">{headers.sno}</th>
                    <th className="p-4 font-bold">{headers.date}</th>
                    {/* Extra Header for Consolidated View */}
                    {viewMode === 'all' && <th className="p-4 font-bold text-purple-600">Source Sheet</th>}
                    <th className="p-4 font-bold">{headers.materialName}</th>
                    <th className="p-4 font-bold">{headers.quantity}</th>
                    <th className="p-4 font-bold">{headers.location}</th>
                    <th className="p-4 font-bold">{headers.staffName}</th>
                    <th className="p-4 font-bold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-50">
                  {displayedRecords.map((r, i) => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="p-4 text-center text-slate-400 font-mono">{i + 1}</td>
                      <td className="p-4 text-slate-600">{r.date}</td>
                      {viewMode === 'all' && (
                        <td className="p-4">
                          <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-semibold">
                            {r.sheetName || 'Sheet1'}
                          </span>
                        </td>
                      )}
                      <td className="p-4 font-semibold text-slate-700">{r.materialName}</td>
                      <td className="p-4">{r.quantity} <span className="text-xs text-slate-400 uppercase">{r.unit}</span></td>
                      <td className="p-4 text-slate-500">{r.location}</td>
                      <td className="p-4 font-medium text-slate-600">{r.staffName}</td>
                      <td className="p-4 text-center">
                        <button onClick={() => handleDelete(r.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* LLM Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-purple-50">
              <h3 className="font-bold text-purple-900 flex items-center">
                <FileText className="w-5 h-5 mr-2 text-purple-600" /> Executive Summary
              </h3>
              <button onClick={() => setShowReportModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-8 min-h-[200px]">
              {isReportLoading ? (
                <div className="flex flex-col items-center justify-center text-purple-500 py-10">
                  <Loader2 className="w-10 h-10 animate-spin mb-4" />
                  <p className="font-medium animate-pulse">Gemini is analyzing the records...</p>
                </div>
              ) : (
                <div className="prose prose-purple max-w-none text-slate-700 text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: (reportText || "").replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setShowReportModal(false)} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center"><Settings className="w-5 h-5 mr-2 text-blue-600" /> Configuration</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <section>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-4 flex items-center"><ExternalLink className="w-4 h-4 mr-2" /> Google Sheet Sync</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Webhook URL</label>
                    <input type="text" value={tempSettings.scriptUrl} onChange={(e) => setTempSettings({ ...tempSettings, scriptUrl: e.target.value })} placeholder="https://script.google.com/..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Destination Sheet Name</label>
                    <input type="text" value={tempSettings.sheetName} onChange={(e) => setTempSettings({ ...tempSettings, sheetName: e.target.value })} placeholder="e.g. Sheet2, Sheet3" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono" />
                    <p className="text-[10px] text-blue-500 mt-1">*If the sheet doesn't exist, it will be created automatically.</p>
                  </div>
                </div>
              </section>

              <hr className="border-slate-100" />

              <section>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-4 flex items-center"><Edit3 className="w-4 h-4 mr-2" /> Label Customization</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries({ sno: 'S.No', date: 'Date', materialName: 'Material', quantity: 'Quantity', unit: 'Unit', location: 'Location', staffName: 'Staff' }).map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{label}</label>
                      <input type="text" value={tempSettings.headers[key]} onChange={(e) => setTempSettings({
                        ...tempSettings,
                        headers: { ...tempSettings.headers, [key]: e.target.value }
                      })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50 shrink-0">
              <button onClick={saveSettings} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-2xl shadow-lg transition-all active:scale-95 uppercase tracking-widest text-sm">Update Settings</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
