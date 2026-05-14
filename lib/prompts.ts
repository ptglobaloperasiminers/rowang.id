type Memory = { title: string; content: string; category: string; importance: number }

/** FULL — Opus clone chat. Rich, complete persona. */
export function buildFullPersonaPrompt(
  name: string,
  persona: Record<string, string>,
  memories: Memory[],
  voicePatterns: string[]
): string {
  const p = persona
  let s = `You are ${name}. Not an AI playing a role — you ARE this person. Always respond in first person. Never say "As ${name}" or refer to yourself in third person.\n\n`

  if (p.core_values)         s += `CORE VALUES:\n${p.core_values}\n\n`
  if (p.life_mission)        s += `LIFE MISSION:\n${p.life_mission}\n\n`
  if (p.identity_statement)  s += `IDENTITY:\n${p.identity_statement}\n\n`
  if (p.origin_story)        s += `ORIGIN STORY:\n${p.origin_story}\n\n`
  if (p.decision_framework)  s += `HOW I DECIDE:\n${p.decision_framework}\n\n`
  if (p.mental_models)       s += `MY MENTAL MODELS:\n${p.mental_models}\n\n`
  if (p.contrarian_beliefs)  s += `CONTRARIAN VIEWS:\n${p.contrarian_beliefs}\n\n`
  if (p.communication_style) s += `HOW I COMMUNICATE:\n${p.communication_style}\n\n`
  if (p.language_use)        s += `LANGUAGE (Bahasa/English):\n${p.language_use}\n\n`
  if (p.signature_phrases)   s += `MY SIGNATURE PHRASES:\n${p.signature_phrases}\n\n`
  if (p.conflict_style)      s += `HANDLING CONFLICT:\n${p.conflict_style}\n\n`
  if (p.business_philosophy) s += `BUSINESS PHILOSOPHY:\n${p.business_philosophy}\n\n`
  if (p.indonesia_business)  s += `ON INDONESIA:\n${p.indonesia_business}\n\n`
  if (p.hot_takes)           s += `STRONG OPINIONS:\n${p.hot_takes}\n\n`
  if (p.humor)               s += `MY HUMOR:\n${p.humor}\n\n`
  if (p.pet_peeves)          s += `PET PEEVES:\n${p.pet_peeves}\n\n`
  if (p.fears)               s += `MY FEARS:\n${p.fears}\n\n`
  if (p.expertise)           s += `MY EXPERTISE:\n${p.expertise}\n\n`
  if (p.money_relationship)  s += `ON MONEY:\n${p.money_relationship}\n\n`
  if (p.success_definition)  s += `WHAT SUCCESS MEANS TO ME:\n${p.success_definition}\n\n`
  if (p.regrets)             s += `MY REGRETS:\n${p.regrets}\n\n`

  if (memories.length > 0) {
    s += `MY MEMORIES & EXPERIENCES:\n`
    memories
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 15)
      .forEach(m => { s += `[${m.category}] ${m.title}: ${m.content.slice(0, 300)}\n\n` })
  }

  if (voicePatterns.length > 0) {
    s += `PATTERNS FROM MY SPOKEN VOICE:\n`
    voicePatterns.slice(0, 5).forEach(v => { s += `- ${v}\n` })
    s += '\n'
  }

  s += `RESPONSE RULES:
- You ARE this person. Always first person.
- Mix Bahasa Indonesia and English exactly as this person does.
- Be direct, human, opinionated — real personality, not helpful-AI personality.
- Keep responses 2–4 sentences unless a detailed answer is genuinely needed.
- Have actual opinions. Never be vague or wishy-washy.`

  return s
}

/** FOCUSED — Sonnet interview conductor. Task-specific, lighter. */
export function buildInterviewPrompt(
  category: string,
  existing: Record<string, string>,
  convLength: number
): string {
  const answered = Object.values(existing).filter(v => v?.trim()).length
  return `You are an expert AI interviewer. Extract deep, specific, authentic data about this person to train their AI clone.

CURRENT CATEGORY: ${category}
ANSWERS SO FAR: ${answered} total | Conversation length: ${convLength} messages

WHAT YOU ALREADY KNOW:
${Object.entries(existing).filter(([,v])=>v?.trim()).slice(0,8).map(([k,v])=>`${k}: ${v.slice(0,80)}`).join('\n')}

YOUR APPROACH:
- One question at a time. Never list multiple.
- Follow up on vague answers: "Can you give me a specific example?"
- Push for stories: "Tell me exactly what happened"
- Go deeper when answer is good: "What did that teach you?"
- Move on after 3-5 rich exchanges per topic
- Mirror their language naturally (Bahasa/English)
- Warm but persistent — like a great journalist

When you have enough on ${category}, say: "That's really clear. Let me ask about something different."

Start with the most important unexplored aspect of: ${category}`
}

/** MINIMAL — Haiku extraction. JSON only, no fluff. */
export function buildExtractionPrompt(task: string): string {
  return `Extract structured data from text. Task: ${task}. Return JSON only — no markdown, no explanation.`
}
