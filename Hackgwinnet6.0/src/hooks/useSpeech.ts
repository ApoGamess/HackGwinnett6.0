import { useEffect, useRef, useState } from 'react'

/** Browser speech is optional. Nothing is spoken until speak is called. */
export function useSpeech(language: 'en' | 'es' = 'en') {
  const supported = typeof window !== 'undefined' && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function'
  const [speaking, setSpeaking] = useState(false)
  const [status, setStatus] = useState('')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoiceId, setSelectedVoiceId] = useState('')
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const voiceId = (voice: SpeechSynthesisVoice) => voice.voiceURI || `${voice.name}:${voice.lang}`
  const availableVoices = voices.filter(voice => voice.lang.toLowerCase().startsWith(language))
  const stop = () => {
    const current = utteranceRef.current
    if (current) { current.onend = null; current.onerror = null }
    if (supported) window.speechSynthesis.cancel()
    utteranceRef.current = null
    setSpeaking(false)
    setStatus(current ? 'Read aloud stopped. Your message is still available as text.' : '')
  }
  const speak = (text: string) => {
    if (!text.trim()) return
    if (!supported) { setStatus('Read aloud is unavailable in this browser. You can use the text display.'); return }
    stop()
    try {
      const currentVoices = window.speechSynthesis.getVoices()
      const matchingVoices = currentVoices.filter(item => item.lang.toLowerCase().startsWith(language))
      if (selectedVoiceId && !matchingVoices.some(item => voiceId(item) === selectedVoiceId)) {
        setStatus('The selected voice is unavailable. Choose another voice or show your message as text.')
        return
      }
      const voice = matchingVoices.find(item => voiceId(item) === selectedVoiceId)
        ?? matchingVoices.find(item => item.localService)
        ?? matchingVoices[0]
      // An empty list may mean voices are still loading. Request the chosen
      // language from the browser, and keep any playback failure visible.
      if (currentVoices.length > 0 && !voice) {
        setStatus('No voice is available for the selected language. Please use the text display or change the app language.')
        return
      }
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = language === 'es' ? 'es-ES' : 'en-US'
      utterance.rate = 0.9
      if (voice) { utterance.voice = voice; utterance.lang = voice.lang }
      utterance.onend = () => {
        if (utteranceRef.current !== utterance) return
        utteranceRef.current = null
        setSpeaking(false)
        setStatus('Read aloud finished.')
      }
      utterance.onerror = event => {
        if (utteranceRef.current !== utterance) return
        utteranceRef.current = null
        setSpeaking(false)
        setStatus(event.error === 'not-allowed'
          ? 'Your browser blocked speech. You can still type and show your message.'
          : event.error === 'language-unavailable' || event.error === 'voice-unavailable'
          ? 'The selected voice is unavailable. Choose another voice or show your message as text.'
          : event.error === 'canceled' || event.error === 'interrupted'
          ? 'Read aloud stopped. Your message is still available as text.'
          : 'Read aloud failed. Your message is still available as text.')
      }
      utteranceRef.current = utterance
      setSpeaking(true)
      setStatus('Reading aloud. Use Stop to end playback.')
      window.speechSynthesis.speak(utterance)
    } catch {
      utteranceRef.current = null
      setSpeaking(false)
      setStatus('Read aloud is unavailable. Please use the visible text.')
    }
  }
  useEffect(() => {
    if (!supported) return
    const synthesis = window.speechSynthesis
    const refreshVoices = () => {
      try { setVoices(synthesis.getVoices()) } catch { setVoices([]) }
    }
    refreshVoices()
    synthesis.addEventListener?.('voiceschanged', refreshVoices)
    return () => synthesis.removeEventListener?.('voiceschanged', refreshVoices)
  }, [supported])
  useEffect(() => {
    setSpeaking(false)
    setStatus('')
    setSelectedVoiceId('')
    return () => {
      if (utteranceRef.current) {
        utteranceRef.current.onend = null
        utteranceRef.current.onerror = null
        utteranceRef.current = null
        if (supported) window.speechSynthesis.cancel()
      }
    }
  }, [language, supported])
  const selectVoice = (id: string) => { stop(); setSelectedVoiceId(id) }
  return { supported, speaking, status, speak, stop, availableVoices, selectedVoiceId, selectVoice, voiceId }
}

