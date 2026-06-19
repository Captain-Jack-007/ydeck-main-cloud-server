import { registerCloudDeckTools } from "./cloudDeck.tools";
import { registerChatTools } from "./chat.tools";
import { registerDeckDocumentTools } from "./deckDocument.tools";
import { registerFileTools } from "./file.tools";
import { registerMemoryTools } from "./memory.tools";
import { registerWebTools } from "./web.tools";
import { executeRegisteredTool, getTool, listTools } from "./registry";

let booted = false;

export function bootstrapTools(): void {
  if (booted) return;
  registerCloudDeckTools();
  registerDeckDocumentTools();
  registerFileTools();
  registerChatTools();
  registerMemoryTools();
  registerWebTools();
  booted = true;
}

export function resetBootstrapForTests(): void {
  booted = false;
}

export { executeRegisteredTool, getTool, listTools };
export type { ToolBlock, ToolContext, ToolDefinition, ToolResult } from "./types";
