#!/bin/bash
sed -i '/if (seekedRef.current) seekedRef.current = null;/a \
\
      // AI Auto-Analysis for Skip Intro/Outro\
      if (episode.hasSkipIntro === undefined) {\
        if ((window as any)._analyzedEpisodeId !== episode.id) {\
          (window as any)._analyzedEpisodeId = episode.id;\
          const triggerAutoAnalysis = async () => {\
            try {\
              console.log(`[CustomPlayer] Triggering automatic AI analysis for ${animeTitle} Ep ${episode.number}`);\
              const response = await fetch("/api/gemini/analyze-episode", {\
                method: "POST",\
                headers: { "Content-Type": "application/json" },\
                body: JSON.stringify({\
                  animeTitle: animeTitle,\
                  episodeTitle: episode.title,\
                  episodeNumber: episode.number,\
                  duration: episode.duration || 1440,\
                  videoUrl: episode.videoUrl\
                })\
              });\
              if (response.ok) {\
                const data = await response.json();\
                if (data.success) {\
                  const confidenceScore = typeof data.confidence === "number" ? data.confidence : 0.85;\
                  if (confidenceScore >= 0.6) {\
                    const epRef = doc(db, "episodes", episode.id);\
                    await updateDoc(epRef, {\
                      hasSkipIntro: data.hasSkipIntro,\
                      introShowAt: data.introShowAt,\
                      introShowDuration: data.introShowDuration,\
                      introSkipTo: data.introSkipTo,\
                      hasSkipOutro: data.hasSkipOutro,\
                      outroShowAt: data.outroShowAt,\
                      outroShowDuration: data.outroShowDuration,\
                      outroSkipTo: data.outroSkipTo\
                    });\
                    console.log(`[CustomPlayer] AI analysis saved to Firestore for Ep ${episode.number}`);\
                  }\
                }\
              }\
            } catch (e) {\
              console.error("Auto analysis failed:", e);\
            }\
          };\
          triggerAutoAnalysis();\
        }\
      }\
' src/components/CustomPlayer.tsx
