import type { AccessFeature, PreparationTask, Provider, Question } from '../types'

export const featureLabels: Record<AccessFeature, string> = {
  stepFree: 'Step-free access', communication: 'Written communication', quiet: 'Quiet waiting',
}

export const accommodationQuestions: Record<AccessFeature, string> = {
  stepFree: 'Can you confirm the step-free route to reception?',
  communication: 'Can staff provide information in writing and allow me to communicate by typing?',
  quiet: 'Is a quieter waiting space available for my visit?',
}

export const providers: Provider[] = [
  { id: 'willow', name: 'Willow Community Clinic', specialty: 'Primary care', area: 'Maplewood neighborhood', address: '24 Willow Lane, Maplewood', initials: 'WC', color: 'teal',
    description: 'A welcoming neighborhood clinic with flexible communication options and a calm space to prepare for your visit.',
    features: ['stepFree', 'communication', 'quiet'],
    accessNotes: ['Step-free main entrance with automatic doors.', 'Written instructions and communication boards available on request.', 'A separate quiet waiting room can be requested at reception.'],
    arrival: 'Use the step-free entrance on Willow Lane and check in at the ground-floor reception desk.' },
  { id: 'cedar', name: 'Cedar Family Practice', specialty: 'Family medicine', area: 'Cedar Park neighborhood', address: '8 Cedar Walk, Maplewood', initials: 'CF', color: 'teal',
    description: 'A small family practice with accessible entrances and support for written communication.',
    features: ['stepFree', 'communication'],
    accessNotes: ['Level entrance from Cedar Walk is listed in this fictional example.', 'Written instructions are listed in this fictional example.', 'Quiet waiting is not specified — ask the clinic.'],
    arrival: 'Enter from Cedar Walk and check in at the reception desk on the ground floor.' },
  { id: 'meadow', name: 'Meadow Health Centre', specialty: 'Community care', area: 'Meadow Green neighborhood', address: '16 Meadow Green, Maplewood', initials: 'MH', color: 'teal',
    description: 'A community care centre with a quieter waiting area and a step-free route to reception.',
    features: ['stepFree', 'quiet'],
    unavailableFeatures: ['communication'],
    accessNotes: ['Step-free side entrance is listed in this fictional example.', 'A quieter waiting area is listed in this fictional example.', 'Written communication support is not available in this fictional sample.'],
    arrival: 'Use the step-free side entrance on Meadow Green and follow signs to reception.' },
]

export const initialTasks: PreparationTask[] = [
  { id: 'find-clinic', text: 'Find a clinic that works for me', done: false, source: 'starter' },
  { id: 'review-letter', text: 'Review my appointment letter', done: false, source: 'starter' },
  { id: 'prepare-questions', text: 'Prepare my questions', done: false, source: 'starter' },
  { id: 'check-access', text: 'Check my access arrangements', done: false, source: 'starter' },
]
export const initialQuestions: Question[] = [
  { id: 'question-1', text: 'Could you explain the next steps in simple language?', discussed: false, note: '' },
  { id: 'question-2', text: 'Can I have the information in writing?', discussed: false, note: '' },
]
export const phrases = ['I would prefer to communicate by typing.', 'Please give me more time.', 'Please explain that again.', 'Could we move to a quieter space?', 'I need help.']
export const simulatedConversation = [
  { speaker: 'You', text: 'I would prefer to communicate by typing.' },
  { speaker: 'Reception staff', text: 'Of course. Take your time. You can show me your message when you are ready.' },
  { speaker: 'You', text: 'Could I wait somewhere quieter?' },
  { speaker: 'Reception staff', text: 'Yes. Let me show you the quiet waiting area.' },
]
