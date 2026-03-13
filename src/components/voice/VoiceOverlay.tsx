// Overlay visual para el modo de dictado por voz
// Muestra estado de escucha, transcripción en tiempo real y resultados

import { Mic, MicOff, AlertCircle } from 'lucide-react'

interface VoiceOverlayProps {
  isListening: boolean
  transcript: string
  interimTranscript: string
  error: string | null
  lastMessage: string | null
  isSupported: boolean
}

export default function VoiceOverlay({
  isListening,
  transcript,
  interimTranscript,
  error,
  lastMessage,
  isSupported,
}: VoiceOverlayProps) {
  if (!isSupported) return null

  // Mostrar feedback brevemente después de un comando procesado
  const showLastMessage = !isListening && lastMessage

  if (!isListening && !showLastMessage) return null

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-end justify-center pb-8">
      {/* Backdrop pulsante cuando escucha */}
      {isListening && (
        <div className="absolute inset-0 bg-black/30 animate-fade-in" />
      )}

      {/* Panel principal */}
      <div className="relative pointer-events-auto animate-fade-in">
        <div className="flex flex-col items-center gap-3">
          {/* Indicador de micrófono */}
          {isListening && (
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-accent-blue/30 animate-ping" />
              <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-accent-blue shadow-lg shadow-accent-blue/30">
                <Mic className="w-8 h-8 text-white" />
              </div>
            </div>
          )}

          {/* Caja de transcripción */}
          <div className="max-w-md rounded-xl bg-card border border-card-border px-6 py-4 shadow-2xl">
            {isListening && (
              <>
                <p className="text-xs font-medium text-accent-blue mb-2 text-center uppercase tracking-wider">
                  Escuchando... (suelta espacio para enviar)
                </p>
                {(interimTranscript || transcript) ? (
                  <p className="text-neutral-100 text-center text-lg">
                    {interimTranscript || transcript}
                  </p>
                ) : (
                  <p className="text-neutral-500 text-center text-sm italic">
                    Di un comando: "filtrar empresa FISA", "limpiar filtros"...
                  </p>
                )}
              </>
            )}

            {error && (
              <div className="flex items-center gap-2 text-accent-red">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {showLastMessage && (
              <div className="flex items-center gap-2">
                <MicOff className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                <p className="text-sm text-neutral-300">{lastMessage}</p>
              </div>
            )}
          </div>

          {/* Hint del teclado */}
          {isListening && (
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 text-xs font-mono bg-neutral-800 border border-neutral-600 rounded text-neutral-400">
                Espacio
              </kbd>
              <span className="text-xs text-neutral-500">Mantén presionado para hablar</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
