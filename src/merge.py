import re

# Order matters for React hooks and dependencies
files = ["canvas.tsx", "panels.tsx", "msgstream.tsx", "thoughts.tsx", "ui.tsx", "inputbar.tsx"]

header = """// ui.tsx - Consolidated UI Components, Stores, and Panels
import React, { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { createPortal } from "react-dom";
import { 
  SourceItem, ChatMessage, AttachmentMeta, 
  useChatStore, useAuthStore, useUIStore, useProfileStore, useMemoryStore, useUsageStore,
  insertMessage, useStreamText, copyText, rid, fetchChats, fetchMessages, renameChat, deleteChat,
  MODELS, CHAT_MODELS, APP_VERSION, abortGemini
} from "./core";
import { 
  ibCSS, hdCSS, dwCSS, auCSS, stCSS, mmCSS, ldCSS, dtCSS, vcCSS,
  umCSS, amCSS, mlCSS, qtsCSS, lockSvg, searchIconSvg, pageIconSvg, ORB_COLORS 
} from "./styles";
"""

body = ""
for f in files:
    try:
        with open(f, 'r', encoding='utf-8') as file:
            code = file.read()
            # Remove old import statements pointing to deleted files
            code = re.sub(r'^import\s+.*?from\s+["\'][^"\']+["\'];?\s*$', '', code, flags=re.MULTILINE)
            # Remove old re-exports like `export { ... } from "./something"`
            code = re.sub(r'^export\s+{.*?}\s+from\s+["\'][^"\']+["\'];?\s*$', '', code, flags=re.MULTILINE)
            body += f"\n\n/* ================= {f.replace('.tsx', '').upper()} ================= */\n" + code
    except FileNotFoundError:
        print(f"Warning: {f} not found. Skipping.")

with open('ui.tsx', 'w', encoding='utf-8') as f:
    f.write(header + body)

print("Successfully merged all UI components into ui.tsx!")