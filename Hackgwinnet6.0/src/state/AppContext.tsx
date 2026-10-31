import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { initialTasks, providers } from '../data/mockData'
import { getSampleLetter } from '../services/mockServices'
import { translate, type TranslationValues } from '../i18n'
import type { DataMode, Place, RouteProfile } from '../navigation/types'
import { DEFAULT_ROUTE_PROFILE } from '../navigation/route'
import type { ConfirmedCheckpoint } from '../navigation/checkpoints'
import type { AccessFeature, AccessStatement, Appointment, AppointmentLetter, ArrivalPlan, FollowUp, Journey, Language, Page, Preferences, PreparationTask, Provider, Question } from '../types'

const SETTINGS_KEY = 'carenori-interface-settings-v1'
const initialPreferences: Preferences = {
  stepFree: false, communication: false, quiet: false,
  largeText: false, highContrast: false, readAloud: false,
  reducedMotion: false, simplified: false,
}
const interfaceKeys = ['largeText', 'highContrast', 'readAloud', 'reducedMotion', 'simplified'] as const
function readSettings(): { language: Language; preferences: Preferences } {
  const preferences = { ...initialPreferences, reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false }
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')
    if (!stored || typeof stored !== 'object') return { language: 'en', preferences }
    const settings = stored as Record<string, unknown>
    interfaceKeys.forEach(key => { if (typeof settings[key] === 'boolean') preferences[key] = settings[key] as boolean })
    return { language: settings.language === 'es' ? 'es' : 'en', preferences }
  } catch { return { language: 'en', preferences } }
}
const builtinStatements = (): AccessStatement[] => [
  { id: 'typing', text: 'I prefer typing.' },
  { id: 'speakDirectly', text: 'Please speak directly to me.' },
  { id: 'communication', text: 'I prefer written communication.' },
  { id: 'extraTime', text: 'Please give me extra time to respond.' },
  { id: 'oneStep', text: 'Please explain one step at a time.' },
  { id: 'quiet', text: 'I would like to ask about a quieter waiting area.' },
  { id: 'stepFree', text: 'I need information about step-free access.' },
]
const emptyArrival = (): ArrivalPlan => ({ transport: '', entrance: '', note: '' })
function pageFromHash(): Page {
  const page = window.location.hash.slice(1)
  return ['care', 'preferences', 'providers', 'letter', 'visit', 'access', 'summary', 'after', 'explore', 'camera'].includes(page) ? page as Page : 'care'
}
const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
const sameScope = (first?: string, second?: string) => !first || !second || first === second
const hasSourceId = (item: { id: string; sourceIds?: string[] }, id: string) => item.id === id || !!item.sourceIds?.includes(id)
function retainSourceId<T extends { id: string; sourceIds?: string[] }>(item: T, id: string): T {
  return hasSourceId(item, id) ? item : { ...item, sourceIds: [...(item.sourceIds ?? []), id] }
}
const starterTasks = () => initialTasks.map(task => ({ ...task }))

function useAppState() {
  const [settings] = useState(readSettings)
  const [page, setPage] = useState<Page>(pageFromHash)
  const [language, setLanguage] = useState<Language>(settings.language)
  const [preferences, setPreferences] = useState<Preferences>(settings.preferences)
  const [started, setStarted] = useState(false)
  const [journey, setJourney] = useState<Journey>('before')
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [tasks, setTasks] = useState<PreparationTask[]>(starterTasks)
  const [questions, setQuestions] = useState<Question[]>([])
  const [message, setMessage] = useState('')
  const [conversation, setConversation] = useState<{ id: string; speaker: 'me' | 'staff'; text: string }[]>([])
  const [conversationSpeaker, setConversationSpeaker] = useState<'me' | 'staff'>('me')
  const [staffDraft, setStaffDraft] = useState('')
  const [navigationPlace, setNavigationPlace] = useState<Place | null>(null)
  const [dataMode, setDataMode] = useState<DataMode>('public')
  const [pendingPlaceQuery, setPendingPlaceQuery] = useState('')
  const [lastConfirmedCheckpoint, setLastConfirmedCheckpoint] = useState<ConfirmedCheckpoint | null>(null)
  const [closedElevators, setClosedElevators] = useState<('A' | 'B')[]>([])
  const [routeSelection, setRouteSelection] = useState({ start: 'parking', destination: 'consultation', active: false })
  const [routeProfile, setRouteProfile] = useState<RouteProfile>(() => ({ ...DEFAULT_ROUTE_PROFILE }))
  const [activeLetter, setActiveLetter] = useState<AppointmentLetter | null>(null)
  const [documents, setDocuments] = useState<AppointmentLetter[]>([])
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [fileInfo, setStoredFileInfo] = useState<{ name: string } | null>(null)
  const [communicationOpen, setCommunicationOpen] = useState(false)
  const [accessStatements, setAccessStatements] = useState<AccessStatement[]>(builtinStatements)
  const [selectedStatements, setSelectedStatements] = useState<string[]>([])
  const [arrivalPlan, setArrivalPlan] = useState<ArrivalPlan>(emptyArrival)
  const [visitNotes, setVisitNotes] = useState('')
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [notice, setNotice] = useState<{ text: string; values?: TranslationValues }>({ text: '' })
  const [resetKey, setResetKey] = useState(0)

  const t = useCallback((text: string, values?: TranslationValues) => translate(language, text, values), [language])
  const questionText = (question: Question) => question.userEntered ? question.text : question.translations?.[language] ?? t(question.text)
  const taskText = (task: PreparationTask) => task.source === 'user' || task.userEdited ? task.text : t(task.textKey ?? task.text, task.textValues ? Object.fromEntries(Object.entries(task.textValues).map(([key, value]) => [key, typeof value === 'string' ? t(value) : value])) : undefined)
  const announcement = t(notice.text, notice.values)
  const notify = (text: string, values?: TranslationValues) => setNotice({ text, values })
  const addConversationTurn = (speaker: 'me' | 'staff', text: string) => {
    if (text.trim()) setConversation(previous => [...previous, { id: crypto.randomUUID(), speaker, text: text.trim().slice(0, 1500) }])
  }
  const clearConversation = () => setConversation([])
  const displayRequests = selectedStatements.filter((id): id is AccessFeature => ['stepFree', 'communication', 'quiet'].includes(id))

  useEffect(() => {
    document.documentElement.lang = language
    // This whitelist deliberately excludes all visit, access, file and message data.
    const saved = { language, ...Object.fromEntries(interfaceKeys.map(key => [key, preferences[key]])) }
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved)) } catch { /* Settings are optional when browser storage is unavailable. */ }
  }, [language, preferences.largeText, preferences.highContrast, preferences.readAloud, preferences.reducedMotion, preferences.simplified])

  const navigate = (next: Page) => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    window.location.hash = next
    setPage(next)
    if (next === 'visit') setJourney('during')
    if (next === 'after') setJourney('after')
  }
  const markDone = (id: string) => setTasks(previous => previous.map(task => task.id === id ? { ...task, done: true } : task))
  const setPreference = (key: keyof Preferences, value: boolean) => setPreferences(previous => ({ ...previous, [key]: value }))
  const setDisplayRequest = (feature: AccessFeature, value: boolean) => setSelectedStatements(previous => value ? [...new Set([...previous, feature])] : previous.filter(id => id !== feature))
  const toggleAccessStatement = (id: string) => {
    if (!accessStatements.some(statement => statement.id === id)) return
    setSelectedStatements(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id])
  }
  const addAccessStatement = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return false
    if (accessStatements.some(statement => normalize(statement.text) === normalize(trimmed) || normalize(statement.custom ? statement.text : t(statement.text)) === normalize(trimmed))) {
      notify('That access statement is already available. Select it to display it.'); return false
    }
    setAccessStatements(previous => [...previous, { id: crypto.randomUUID(), text: trimmed, custom: true }])
    notify('Statement added. Select it when you want to display it.')
    return true
  }
  const removeAccessStatement = (id: string) => {
    if (!accessStatements.some(statement => statement.id === id && statement.custom)) return
    setAccessStatements(previous => previous.filter(statement => statement.id !== id))
    setSelectedStatements(previous => previous.filter(item => item !== id))
    notify('Access statement removed.')
  }
  const updateAccessStatement = (id: string, text: string) => {
    const trimmed = text.trim()
    if (!trimmed || !accessStatements.some(statement => statement.id === id && statement.custom)) return false
    if (accessStatements.some(statement => statement.id !== id && (normalize(statement.text) === normalize(trimmed) || normalize(statement.custom ? statement.text : t(statement.text)) === normalize(trimmed)))) {
      notify('That access statement is already available. Select it to display it.'); return false
    }
    setAccessStatements(previous => previous.map(statement => statement.id === id ? { ...statement, text: trimmed } : statement))
    notify('Access statement updated.')
    return true
  }
  const startPlan = () => {
    setStarted(true); setJourney('before'); navigate('care')
    notify('Your visit plan is ready to begin. Add only what is useful to you.')
  }
  const addProvider = (provider: Provider) => {
    // The provider view resolves incompatible details before this explicit action.
    if (selectedProvider?.id !== provider.id) {
      setAppointment(null); setActiveLetter(null)
      setTasks(previous => previous.map(task => task.id === 'review-letter' ? { ...task, done: false } : task))
    }
    setStarted(true); setSelectedProvider(provider); markDone('find-clinic')
    notify('{name} added to your visit plan. No appointment has been booked.', { name: provider.name })
  }
  const exploreSample = () => {
    const provider = selectedProvider ?? providers[0]
    setStarted(true); setJourney('before'); setSelectedProvider(provider)
    setActiveLetter(getSampleLetter(provider)); markDone('find-clinic'); navigate('care')
    notify('Fictional sample clinic added. Review the matching letter before confirming sample appointment details.')
  }
  const openLetter = (provider?: Provider, variant: 'original' | 'updated' = 'original') => setActiveLetter(getSampleLetter(provider ?? selectedProvider ?? providers[0], variant))
  const openDocument = (document: AppointmentLetter) => setActiveLetter(document)
  const setFileInfo = (file: { name: string } | null) => { setStoredFileInfo(file); if (file) setActiveLetter(null) }
  const confirmLetter = (letter: AppointmentLetter, taskIds: string[]) => {
    const provider = providers.find(item => item.id === letter.providerId)
    if (!provider) { notify('This sample clinic is unavailable. Choose a clinic before confirming its letter.'); return }
    setStarted(true); setSelectedProvider(provider)
    setAppointment({
      letterId: letter.id, providerId: letter.providerId, clinicName: letter.clinicName,
      date: letter.date, time: letter.time, arrivalTime: letter.arrivalTime,
      address: letter.address, arrival: letter.arrival, source: 'sample',
    })
    setActiveLetter(letter)
    setDocuments(previous => previous.some(document => document.id === letter.id) ? previous : [...previous, letter])
    const incoming = letter.tasks.filter(task => taskIds.includes(task.id))
    setTasks(previous => {
      const next = previous.map(task => ['find-clinic', 'review-letter'].includes(task.id) ? { ...task, done: true } : task)
      incoming.forEach(task => {
        const index = next.findIndex(existing => hasSourceId(existing, task.id) || (sameScope(existing.providerId, letter.providerId) && (normalize(existing.text) === normalize(task.text) || normalize(taskText(existing)) === normalize(taskText(task)))))
        if (index >= 0) next[index] = retainSourceId(next[index], task.id)
        else next.push({ ...task, providerId: letter.providerId, letterId: letter.id })
      })
      return next
    })
    notify('Sample appointment details and your selected preparation items added to your visit. No appointment has been booked.')
  }
  const updateAppointment = (details: Partial<Appointment>) => {
    setStarted(true)
    if (details.providerId === '') { setSelectedProvider(null); setActiveLetter(null) }
    setAppointment(previous => {
      const fields: (keyof Appointment)[] = ['clinicName', 'date', 'time', 'arrivalTime', 'address', 'arrival']
      const editedFields = [...new Set([...(previous?.editedFields ?? []), ...(details.editedFields ?? []), ...fields.filter(key => details[key] !== undefined && details[key] !== previous?.[key])])]
      return {
        letterId: previous?.letterId ?? `user-appointment-${crypto.randomUUID()}`,
        providerId: previous?.providerId ?? selectedProvider?.id ?? '',
        clinicName: previous?.clinicName ?? selectedProvider?.name ?? '',
        date: previous?.date ?? '', time: previous?.time ?? '', arrivalTime: previous?.arrivalTime ?? '',
        address: previous?.address ?? selectedProvider?.address ?? '', arrival: previous?.arrival ?? '',
        source: previous?.source ?? 'user', ...details, userEdited: true, editedFields,
      }
    })
    notify('Appointment details updated for this session. No booking or clinic update has been made.')
  }
  const addTask = (text: string, sourceId?: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const duplicate = (task: PreparationTask) => (!!sourceId && hasSourceId(task, sourceId)) || normalize(task.text) === normalize(trimmed) || normalize(taskText(task)) === normalize(sourceId ? t(trimmed) : trimmed)
    if (tasks.some(duplicate)) {
      if (sourceId) setTasks(previous => previous.map(task => duplicate(task) ? retainSourceId(task, sourceId) : task))
      notify('That preparation item is already in your checklist.'); return
    }
    const task: PreparationTask = { id: sourceId ?? crypto.randomUUID(), text: trimmed, done: false, source: sourceId ? 'starter' : 'user', userEdited: !sourceId }
    setTasks(previous => previous.some(duplicate) ? previous : [...previous, task]); setStarted(true)
    notify('Preparation item added.')
  }
  const updateTask = (id: string, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const current = tasks.find(task => task.id === id)
    if (tasks.some(task => task.id !== id && sameScope(task.providerId, current?.providerId) && (normalize(task.text) === normalize(trimmed) || normalize(taskText(task)) === normalize(trimmed)))) {
      notify('Another preparation item already has that text.'); return
    }
    setTasks(previous => previous.map(task => task.id === id ? { ...task, text: trimmed, userEdited: true } : task))
    notify('Preparation item updated.')
  }
  const removeTask = (id: string) => { setTasks(previous => previous.filter(task => task.id !== id)); notify('Preparation item removed.') }
  const toggleTask = (id: string) => setTasks(previous => previous.map(task => task.id === id ? { ...task, done: !task.done } : task))
  const addQuestion = (text: string, id?: string, providerId?: string, translations?: { en: string; es: string }, navigationSource?: Question['navigationSource']) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const isDuplicate = (question: Question) => (id !== undefined && hasSourceId(question, id)) || (sameScope(question.providerId, providerId) && ((!!id && !!question.sourceText && normalize(question.sourceText) === normalize(trimmed)) || normalize(question.text) === normalize(trimmed) || normalize(questionText(question)) === normalize(id ? t(trimmed) : trimmed)))
    if (questions.some(isDuplicate)) {
      if (id) setQuestions(previous => {
        const existing = previous.find(isDuplicate)
        return existing ? previous.map(question => question.id === existing.id ? { ...retainSourceId(question, id), sourceText: question.sourceText ?? trimmed } : question) : previous
      })
      notify('That question is already in your visit plan.'); return
    }
    const question: Question = { id: id ?? crypto.randomUUID(), text: trimmed, discussed: false, note: '', priority: false, userEntered: !id, translations, navigationSource, ...(id ? { sourceText: trimmed } : {}), ...(providerId ? { providerId } : {}) }
    setQuestions(previous => {
      const existing = previous.find(isDuplicate)
      if (existing) return id ? previous.map(item => item.id === existing.id ? retainSourceId(item, id) : item) : previous
      return [...previous, question]
    })
    setStarted(true); markDone('prepare-questions')
    notify('Question added to your visit plan.')
  }
  const updateQuestion = (id: string, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const question = questions.find(item => item.id === id)
    if (questions.some(item => item.id !== id && sameScope(item.providerId, question?.providerId) && (normalize(item.text) === normalize(trimmed) || normalize(questionText(item)) === normalize(trimmed)))) {
      notify('Another question already has that text.'); return
    }
    setQuestions(previous => previous.map(item => item.id === id ? { ...item, text: trimmed, userEntered: true } : item))
    markDone('prepare-questions'); notify('Question updated.')
  }
  const removeQuestion = (id: string) => { setQuestions(previous => previous.filter(question => question.id !== id)); notify('Question removed.') }
  const toggleQuestion = (id: string) => setQuestions(previous => previous.map(question => question.id === id ? { ...question, discussed: !question.discussed } : question))
  const toggleQuestionPriority = (id: string) => setQuestions(previous => previous.map(question => question.id === id ? { ...question, priority: !question.priority } : question))
  const moveQuestion = (id: string, direction: 'up' | 'down') => {
    setQuestions(previous => {
      const index = previous.findIndex(question => question.id === id)
      const destination = index + (direction === 'up' ? -1 : 1)
      if (index < 0 || destination < 0 || destination >= previous.length) return previous
      const next = [...previous]
      ;[next[index], next[destination]] = [next[destination], next[index]]
      return next
    })
    notify(direction === 'up' ? 'Question moved up.' : 'Question moved down.')
  }
  const updateQuestionNote = (id: string, note: string) => setQuestions(previous => previous.map(question => question.id === id ? { ...question, note } : question))
  const addFollowUp = (input: string | { title: string; dueDate?: string; note?: string }, dueDate = '', note = '') => {
    const values = typeof input === 'string' ? { title: input, dueDate, note } : input
    const title = values.title.trim()
    if (!title) return
    if (followUps.some(task => normalize(task.title) === normalize(title) && task.dueDate === (values.dueDate ?? ''))) { notify('That follow-up task is already in your list.'); return }
    const task: FollowUp = { id: crypto.randomUUID(), title, dueDate: values.dueDate ?? '', note: values.note ?? '', done: false }
    setFollowUps(previous => [...previous, task]); setStarted(true)
    notify('Follow-up task added. No notification has been scheduled.')
  }
  const updateFollowUp = (id: string, changes: Partial<Omit<FollowUp, 'id'>>) => {
    if (changes.title !== undefined && !changes.title.trim()) return
    const existing = followUps.find(task => task.id === id)
    if (!existing) return
    const updated = { ...existing, ...changes, title: changes.title?.trim() ?? existing.title }
    if (followUps.some(task => task.id !== id && normalize(task.title) === normalize(updated.title) && task.dueDate === updated.dueDate)) { notify('That follow-up task is already in your list.'); return }
    setFollowUps(previous => previous.map(task => task.id === id ? updated : task)); notify('Follow-up task updated.')
  }
  const toggleFollowUp = (id: string) => setFollowUps(previous => previous.map(task => task.id === id ? { ...task, done: !task.done } : task))
  const removeFollowUp = (id: string) => { setFollowUps(previous => previous.filter(task => task.id !== id)); notify('Follow-up task removed.') }
  const resetDemo = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setPreferences(previous => ({ ...previous, stepFree: false, communication: false, quiet: false }))
    setStarted(false); setJourney('before'); setSelectedProvider(null); setTasks(starterTasks()); setQuestions([])
    setMessage(''); setActiveLetter(null); setDocuments([]); setAppointment(null); setStoredFileInfo(null)
    setConversation([]); setConversationSpeaker('me'); setStaffDraft(''); setNavigationPlace(null)
    setPendingPlaceQuery(''); setLastConfirmedCheckpoint(null); setDataMode('public')
    setRouteSelection({ start: 'parking', destination: 'consultation', active: false }); setRouteProfile({ ...DEFAULT_ROUTE_PROFILE })
    setCommunicationOpen(false); setSelectedStatements([]); setAccessStatements(builtinStatements())
    setArrivalPlan(emptyArrival()); setVisitNotes(''); setFollowUps([])
    setResetKey(previous => previous + 1); navigate('care')
    notify('Session reset. Visit details, documents, messages, notes, access requests and follow-up tasks cleared. Interface settings kept. Printed or downloaded copies are not removed.')
  }
  return {
    page, setPage, navigate, preferences, setPreference, language, setLanguage, t, questionText, taskText,
    started, startPlan, exploreSample, journey, setJourney, selectedProvider, addProvider,
    tasks, addTask, updateTask, removeTask, toggleTask,
    questions, addQuestion, updateQuestion, removeQuestion, toggleQuestion, updateQuestionNote, toggleQuestionPriority, moveQuestion,
    message, setMessage, activeLetter, openLetter, openDocument, documents, appointment, confirmLetter, updateAppointment,
    conversation, addConversationTurn, clearConversation, conversationSpeaker, setConversationSpeaker, staffDraft, setStaffDraft, navigationPlace, setNavigationPlace,
    dataMode, setDataMode, pendingPlaceQuery, setPendingPlaceQuery, lastConfirmedCheckpoint, setLastConfirmedCheckpoint, closedElevators, setClosedElevators, routeSelection, setRouteSelection, routeProfile, setRouteProfile,
    fileInfo, setFileInfo, communicationOpen, setCommunicationOpen, displayRequests, setDisplayRequest,
    accessStatements, selectedStatements, toggleAccessStatement, addAccessStatement, updateAccessStatement, removeAccessStatement,
    arrivalPlan, setArrivalPlan, visitNotes, setVisitNotes, followUps, addFollowUp, updateFollowUp, toggleFollowUp, removeFollowUp,
    announcement, notify, resetDemo, resetKey,
  }
}

const AppContext = createContext<ReturnType<typeof useAppState> | null>(null)
export function AppProvider({ children }: { children: ReactNode }) {
  const state = useAppState()
  return <AppContext.Provider value={state}>{children}</AppContext.Provider>
}
export function useApp() {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used within AppProvider')
  return value
}
