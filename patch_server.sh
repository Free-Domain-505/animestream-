#!/bin/bash
sed -i '33i \
export interface AILog {\
  timestamp: string;\
  action: string;\
  status: "SUCCESS" | "ERROR" | "INFO";\
  details: string;\
  model: string;\
}\
\
const aiLogs: AILog[] = [];\
\
function addAILog(action: string, status: "SUCCESS" | "ERROR" | "INFO", details: string, model: string = "system") {\
  aiLogs.unshift({\
    timestamp: new Date().toISOString(),\
    action,\
    status,\
    details,\
    model\
  });\
  if (aiLogs.length > 200) aiLogs.pop();\
}\
' server.ts
