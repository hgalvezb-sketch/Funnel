// Hook para reconocimiento de voz usando Web Speech API
// Activado manteniendo presionada la barra espaciadora

import { useState, useRef, useCallback, useEffect } from 'react'

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

export interface VoiceState {
  isListening: boolean
  transcript: string
  interimTranscript: string
  error: string | null
  isSupported: boolean
}

interface UseVoiceRecognitionOptions {
  onResult?: (transcript: string) => void
  lang?: string
}

export function useVoiceRecognition({ onResult, lang = 'es-MX' }: UseVoiceRecognitionOptions = {}) {
  const [state, setState] = useState<VoiceState>({
    isListening: false,
    transcript: '',
    interimTranscript: '',
    error: null,
    isSupported: typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window),
  })

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  // Inicializar reconocimiento
  useEffect(() => {
    if (!state.isSupported) return

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognitionClass()

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = lang

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let final = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }

      if (final) {
        setState(prev => ({ ...prev, transcript: final, interimTranscript: '' }))
        onResultRef.current?.(final.trim())
      } else {
        setState(prev => ({ ...prev, interimTranscript: interim }))
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // no-speech is not really an error, just silence
      if (event.error === 'no-speech') return
      setState(prev => ({ ...prev, error: event.error }))
    }

    recognition.onend = () => {
      setState(prev => ({ ...prev, isListening: false, interimTranscript: '' }))
    }

    recognitionRef.current = recognition

    return () => {
      recognition.abort()
    }
  }, [lang, state.isSupported])

  const startListening = useCallback(() => {
    if (!recognitionRef.current || !state.isSupported) return
    try {
      setState(prev => ({
        ...prev,
        isListening: true,
        transcript: '',
        interimTranscript: '',
        error: null,
      }))
      recognitionRef.current.start()
    } catch {
      // Already started
    }
  }, [state.isSupported])

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return
    try {
      recognitionRef.current.stop()
    } catch {
      // Already stopped
    }
  }, [])

  return { ...state, startListening, stopListening }
}
