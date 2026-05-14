export type ConfidenceBreakdown = {
  interview:   number  // max 30
  voice:       number  // max 20
  memories:    number  // max 20
  media:       number  // max 10
  calibration: number  // max 15
  chat:        number  // max 5
  total:       number
  label:       string
  nextAction:  string
  isUnlocked:  boolean // 85+
  canSell:     boolean // 95+
}

export const TOTAL_FIELDS = 35

export function calculateConfidence(p: {
  answeredFields: number
  memoryCount:    number
  voiceSeconds:   number
  photoCount:     number
  videoCount:     number
  chatCount:      number
  yesVotes:       number
  noVotes:        number
}): ConfidenceBreakdown {

  const interview = Math.min(Math.round((p.answeredFields / TOTAL_FIELDS) * 30), 30)

  const memories = Math.min(Math.round(
    p.memoryCount >= 50 ? 20 :
    p.memoryCount >= 30 ? 16 :
    p.memoryCount >= 15 ? 12 :
    p.memoryCount >= 5  ? 7  :
    p.memoryCount * 1.3
  ), 20)

  const voiceMin = p.voiceSeconds / 60
  const voice = Math.min(Math.round(
    voiceMin >= 60 ? 20 :
    voiceMin >= 30 ? 16 :
    voiceMin >= 10 ? 11 :
    voiceMin >= 3  ? 6  :
    voiceMin * 1.8
  ), 20)

  const media = Math.min(Math.round(p.photoCount * 0.5 + p.videoCount * 2), 10)

  const totalVotes  = p.yesVotes + p.noVotes
  const hasMix      = p.yesVotes > 0 && p.noVotes > 0
  const calibration = Math.min(Math.round(
    totalVotes >= 40 ? 13 :
    totalVotes >= 20 ? 10 :
    totalVotes >= 10 ? 7  :
    totalVotes * 0.55
  ) + (hasMix ? 2 : 0), 15)

  const chat = Math.min(Math.round(p.chatCount * 0.25), 5)

  const total      = Math.min(interview + memories + voice + media + calibration + chat, 100)
  const isUnlocked = total >= 85
  const canSell    = total >= 95

  const label =
    total < 10 ? 'No data yet'     :
    total < 25 ? 'Just starting'   :
    total < 45 ? 'Building'        :
    total < 60 ? 'Taking shape'    :
    total < 75 ? 'Getting real'    :
    total < 85 ? 'Almost unlocked' :
    total < 95 ? 'Clone active'    :
               'Full confidence'

  const nextAction =
    interview < 20  ? 'Complete the AI Interview — highest impact action' :
    voice < 10      ? 'Record voice memos — speak for 10+ minutes total'  :
    memories < 10   ? 'Add memories — stories, decisions, experiences'    :
    media < 5       ? 'Upload photos or video — visual identity'          :
    calibration < 8 ? 'Rate AI responses in Chat to calibrate'            :
                      'Keep adding voice + memories to reach 100%'

  return { interview, memories, voice, media, calibration, chat, total, label, nextAction, isUnlocked, canSell }
}
