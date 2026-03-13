import { useState, useEffect, useCallback, useRef } from 'react'

export interface VoiceState {
  isListening: boolean
  transcript: string
  status: 'idle' | 'listening' | 'processing' | 'success' | 'error'
  message: string
}

interface UseVoiceCommandOptions {
  onCommand: (transcript: string) => void
  enabled?: boolean
}

export function useVoiceCommand({ onCommand, enabled = true }: UseVoiceCommandOptions): VoiceState {
  const [state, setState] = useState<VoiceState>({
    isListening: false,
    transcript: '',
    status: 'idle',
    message: '',
  })

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const isHoldingRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setState(s => ({ ...s, status: 'error', message: 'Tu navegador no soporta reconocimiento de voz' }))
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.lang = 'es-MX'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setState({ isListening: true, transcript: '', status: 'listening', message: 'Escuchando...' })
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1]
      const transcript = result[0].transcript
      setState(s => ({
        ...s,
        transcript,
        status: result.isFinal ? 'processing' : 'listening',
        message: result.isFinal ? 'Procesando...' : transcript,
      }))

      if (result.isFinal) {
        onCommand(transcript.toLowerCase().trim())
        setState(s => ({ ...s, status: 'success', message: `"${transcript}"` }))
        clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
          setState({ isListening: false, transcript: '', status: 'idle', message: '' })
        }, 2000)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') {
        setState(s => ({ ...s, status: 'idle', isListening: false, message: '' }))
      } else if (event.error !== 'aborted') {
        setState(s => ({
          ...s,
          status: 'error',
          isListening: false,
          message: `Error: ${event.error}`,
        }))
        clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
          setState({ isListening: false, transcript: '', status: 'idle', message: '' })
        }, 3000)
      }
    }

    recognition.onend = () => {
      setState(s => {
        if (s.status === 'listening') {
          return { ...s, isListening: false, status: 'idle', message: '' }
        }
        return { ...s, isListening: false }
      })
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [onCommand])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return

      // No activar si el foco está en un input, textarea o select
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (!isHoldingRef.current) {
        e.preventDefault()
        isHoldingRef.current = true
        startListening()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return

      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (isHoldingRef.current) {
        e.preventDefault()
        isHoldingRef.current = false
        stopListening()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      recognitionRef.current?.abort()
      clearTimeout(timeoutRef.current)
    }
  }, [enabled, startListening, stopListening])

  return state
}
