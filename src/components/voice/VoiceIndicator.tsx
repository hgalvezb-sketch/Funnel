import { Mic, MicOff, Check, AlertCircle } from 'lucide-react'
import type { VoiceState } from '../../hooks/useVoiceCommand'

interface VoiceIndicatorProps {
  voice: VoiceState
}

export default function VoiceIndicator({ voice }: VoiceIndicatorProps) {
  if (voice.status === 'idle') return null

  const statusConfig = {
    listening: {
      icon: <Mic className="h-6 w-6 text-white" />,
      bg: 'bg-accent-red',
      ring: 'ring-accent-red/30',
      pulse: true,
    },
    processing: {
      icon: <Mic className="h-6 w-6 text-white" />,
      bg: 'bg-accent-amber',
      ring: 'ring-accent-amber/30',
      pulse: false,
    },
    success: {
      icon: <Check className="h-6 w-6 text-white" />,
      bg: 'bg-aef',
      ring: 'ring-aef/30',
      pulse: false,
    },
    error: {
      icon: <MicOff className="h-6 w-6 text-white" />,
      bg: 'bg-accent-red',
      ring: 'ring-accent-red/30',
      pulse: false,
    },
  }

  const config = statusConfig[voice.status as keyof typeof statusConfig]
  if (!config) return null

  return (
    <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
      <div className="flex items-center gap-3 rounded-2xl bg-card/95 px-5 py-3 shadow-2xl ring-1 ring-card-border backdrop-blur-md">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${config.bg} ring-4 ${config.ring} ${config.pulse ? 'animate-voice-pulse' : ''}`}>
          {config.icon}
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">
            {voice.status === 'listening' && 'Escuchando'}
            {voice.status === 'processing' && 'Procesando'}
            {voice.status === 'success' && 'Comando aplicado'}
            {voice.status === 'error' && 'Error'}
          </span>
          <span className="max-w-xs truncate text-sm text-neutral-200">
            {voice.message || 'Habla ahora...'}
          </span>
        </div>
        {voice.status === 'listening' && (
          <div className="ml-2 flex gap-1">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="h-4 w-1 rounded-full bg-accent-red"
                style={{
                  animation: `voice-bar 0.6s ease-in-out ${i * 0.15}s infinite alternate`,
                }}
              />
            ))}
          </div>
        )}
      </div>
      {voice.status === 'listening' && (
        <p className="mt-2 text-center text-xs text-neutral-500">
          Suelta la barra espaciadora para terminar
        </p>
      )}
    </div>
  )
}
