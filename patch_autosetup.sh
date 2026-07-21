#!/bin/bash
sed -i '/"\[SYSTEM\] Establishing connection to Gemini API service..."/a \
    ]);\
\
    try {\
      const statusRes = await fetch("/api/gemini/status");\
      if (statusRes.ok) {\
        const statusData = await statusRes.json();\
        setAutoSetupLogs(prev => [...prev, `[SYSTEM] Gemini API Status: ${statusData.status} - ${statusData.message}`]);\
        if (statusData.status !== "ONLINE") {\
          setAutoSetupLogs(prev => [...prev, "⚠️ Warning: Proceeding with local heuristics fallback as Gemini API is offline."]);\
        }\
      }\
    } catch (e) {\
      setAutoSetupLogs(prev => [...prev, "❌ Failed to reach backend API to check Gemini status."]);\
    }' src/components/AdminSection.tsx
