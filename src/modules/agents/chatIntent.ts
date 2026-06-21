export type AgentMessageIntent = "chat" | "create_deck" | "edit_deck";

export interface AgentMessageIntentResult {
  intent: AgentMessageIntent;
  confidence: number;
  reason: string;
  normalizedMessage: string;
  inferredSlideCount?: number;
  inferredLanguage?: string;
  refinementKind?: "design" | "content" | "general";
}

const GREETING_RE = /^(hi|hello|hey|yo|gm|good morning|good afternoon|good evening|howdy|sup|what'?s up)[!.\s]*$/i;
const THANKS_RE = /^(thanks|thank you|thx|ok|okay|cool|great|nice)[!.\s]*$/i;
const HELP_RE = /^(help|what can you do|what do you do|how does this work)[?!. \s]*$/i;

const CREATE_DECK_RE =
  /\b(create|make|generate|build|draft|prepare|turn|convert|design|need|want|would like)\b[\s\S]{0,80}\b(deck|presentation|ppt|pptx|slide|slides|slide deck|pitch deck)\b|\b(deck|presentation|ppt|pptx|slide|slides|slide deck|pitch deck)\b[\s\S]{0,80}\b(create|make|generate|build|draft|prepare|design|need|want|would like|about|for)\b/i;

const WANT_PRESENTATION_RE =
  /\b(i\s+need|i\s+want|we\s+need|we\s+want|need|want|would\s+like)\b[\s\S]{0,80}\b(ppt|pptx|presentation|deck|slides)\b[\s\S]{0,120}\b(about|on|for)\b/i;

const EDIT_DECK_RE =
  /\b(edit|revise|refine|update|change|rewrite|improve|redesign|regenerate|translate|shorten|expand|make.+more|less text|more visual)\b[\s\S]{0,120}\b(deck|presentation|ppt|pptx|slides|slide|page)\b/i;

const IMPLICIT_DECK_RE =
  /\b(investor pitch|pitch deck|lesson slides|sales deck|business plan deck|company profile|market opportunity slide|presentation about|slides about)\b/i;

const MULTILINGUAL_CREATE_DECK_RE =
  /(ppt|pptx|powerpoint|презентац|слайд|презент|演示|幻灯片|投影片|簡報|プレゼン|スライド|프레젠테이션|슬라이드|عرض تقديمي|شرائح|presentación|diapositiva|présentation|diapositive|präsentation|folie|presentazione|diapositiva|apresentação|slide|taqdimot|slayd)/i;

const MULTILINGUAL_CREATE_VERB_RE =
  /(созда|сдела|подготов|нужн|作成|作って|制作|生成|创建|建立|需要|必要|만들|생성|필요|أنشئ|اصنع|أريد|احتاج|cr[eé]a|crear|haz|hacer|necesito|quiero|fais|faire|besoin|erstelle|machen|brauche|crea|criar|preciso|yarat|tayyorla|kerak|lozim|xohlayman|istayman)/i;

const DESIGN_REFINEMENT_RE =
  /\b(different design|new design|try another design|try a different|redesign|change the look|visual style|make it modern|more modern|more visual|new style|different style|fresh design|better design)\b/i;

export function classifyAgentMessage(message: string, input: { hasProject?: boolean } = {}): AgentMessageIntentResult {
  const normalizedMessage = message.replace(/\s+/g, " ").trim();
  if (!normalizedMessage) {
    return {
      intent: "chat",
      confidence: 1,
      reason: "empty_message",
      normalizedMessage,
    };
  }

  if (GREETING_RE.test(normalizedMessage) || THANKS_RE.test(normalizedMessage) || HELP_RE.test(normalizedMessage)) {
    return {
      intent: "chat",
      confidence: 0.98,
      reason: "casual_chat_or_help",
      normalizedMessage,
    };
  }

  if (input.hasProject && EDIT_DECK_RE.test(normalizedMessage)) {
    return {
      intent: "edit_deck",
      confidence: 0.88,
      reason: "deck_edit_keywords_with_project",
      normalizedMessage,
      refinementKind: DESIGN_REFINEMENT_RE.test(normalizedMessage) ? "design" : "general",
    };
  }

  if (input.hasProject && DESIGN_REFINEMENT_RE.test(normalizedMessage)) {
    return {
      intent: "edit_deck",
      confidence: 0.9,
      reason: "design_refinement_with_project",
      normalizedMessage,
      refinementKind: "design",
    };
  }

  if (CREATE_DECK_RE.test(normalizedMessage) || WANT_PRESENTATION_RE.test(normalizedMessage) || IMPLICIT_DECK_RE.test(normalizedMessage)) {
    return {
      intent: "create_deck",
      confidence: 0.9,
      reason: "deck_creation_keywords",
      normalizedMessage,
      inferredSlideCount: inferSlideCount(normalizedMessage),
      inferredLanguage: inferLanguage(normalizedMessage),
    };
  }

  if (MULTILINGUAL_CREATE_DECK_RE.test(normalizedMessage) && (MULTILINGUAL_CREATE_VERB_RE.test(normalizedMessage) || hasNonAscii(normalizedMessage))) {
    return {
      intent: "create_deck",
      confidence: 0.78,
      reason: "multilingual_deck_creation_keywords",
      normalizedMessage,
      inferredSlideCount: inferSlideCount(normalizedMessage),
      inferredLanguage: inferLanguage(normalizedMessage),
    };
  }

  if (input.hasProject && /\b(slide\s*\d+|this slide|the deck|current deck)\b/i.test(normalizedMessage)) {
    return {
      intent: "edit_deck",
      confidence: 0.72,
      reason: "current_deck_reference",
      normalizedMessage,
    };
  }

  return {
    intent: "chat",
    confidence: hasNonAscii(normalizedMessage) ? 0.35 : 0.55,
    reason: hasNonAscii(normalizedMessage) ? "needs_llm_intent_multilingual" : "needs_llm_intent",
    normalizedMessage,
  };
}

export function inferSlideCount(message: string): number | undefined {
  const normalized = message.replace(/\s+/g, " ").trim().toLowerCase();
  const explicit = normalized.match(/\b(\d{1,2})\s*[- ]?(slide|slides|page|pages)\b/);
  if (explicit) return Math.max(1, Math.min(100, Number(explicit[1])));
  if (/\bone\s+slide\b|\bsingle\s+slide\b|\b1\s*[- ]?slide\b/.test(normalized)) return 1;
  return undefined;
}

export function buildChatReply(message: string): string {
  const text = message.replace(/\s+/g, " ").trim();
  if (GREETING_RE.test(text)) {
    return "Hello! I can help you create a new deck, refine an existing slide, research a topic, or export a presentation. Tell me what you want to make.";
  }
  if (HELP_RE.test(text)) {
    return "I can create decks from prompts or files, research facts, find safe Pexels images, design slide previews, repair weak slides, and export HTML or PPTX.";
  }
  if (THANKS_RE.test(text)) {
    return "You got it. Send me a topic or a deck instruction whenever you're ready.";
  }
  return "I’m here. If you want a deck, say something like “create a 10-slide investor pitch deck for...” or ask me to edit an existing slide.";
}

function hasNonAscii(value: string): boolean {
  return /[^\u0000-\u007f]/.test(value);
}

export function inferLanguage(message: string): string | undefined {
  if (/[\u3040-\u30ff]/.test(message)) return "ja";
  if (/[\uac00-\ud7af]/.test(message)) return "ko";
  if (/[\u0600-\u06ff]/.test(message)) return "ar";
  if (/[\u0400-\u04ff]/.test(message)) return "ru";
  if (/[\u4e00-\u9fff]/.test(message)) return "zh";
  if (/\b(taqdimot|slayd|yarat|tayyorla|haqida)\b/i.test(message)) return "uz";
  if (/\b(presentaci[oó]n|diapositiva|crear|haz|sobre)\b/i.test(message)) return "es";
  if (/\b(pr[eé]sentation|diapositive|cr[eé]e|fais|sur)\b/i.test(message)) return "fr";
  if (/\b(präsentation|folie|erstelle|über)\b/i.test(message)) return "de";
  if (/\b(presentazione|diapositiva|crea|su)\b/i.test(message)) return "it";
  if (/\b(apresenta[cç][aã]o|criar|sobre)\b/i.test(message)) return "pt";
  return undefined;
}
