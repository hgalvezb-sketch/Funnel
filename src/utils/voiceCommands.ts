// Procesador de comandos de voz para el dashboard
// Interpreta transcripciones en español y aplica filtros

import { DashboardFilters, AvailableOptions } from '../types/funnel'

export interface VoiceCommandResult {
  action: 'filter' | 'clear' | 'unknown'
  message: string
  filterKey?: keyof DashboardFilters
  filterValue?: string[]
}

// Normalizar texto: minúsculas, sin acentos
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

// Buscar coincidencia fuzzy en opciones disponibles
function findMatch(input: string, options: string[]): string | null {
  const normalizedInput = normalize(input)
  // Coincidencia exacta
  for (const opt of options) {
    if (normalize(opt) === normalizedInput) return opt
  }
  // Coincidencia parcial
  for (const opt of options) {
    if (normalize(opt).includes(normalizedInput) || normalizedInput.includes(normalize(opt))) {
      return opt
    }
  }
  return null
}

export function processVoiceCommand(
  transcript: string,
  availableOptions: AvailableOptions
): VoiceCommandResult {
  const text = normalize(transcript)

  // Comando: limpiar filtros
  if (
    text.includes('limpiar') ||
    text.includes('borrar filtros') ||
    text.includes('quitar filtros') ||
    text.includes('resetear') ||
    text.includes('mostrar todo')
  ) {
    return { action: 'clear', message: 'Filtros limpiados' }
  }

  // Comando: filtrar por empresa
  if (text.includes('empresa') || text.includes('fisa') || text.includes('aef')) {
    const match = findMatch(
      text.replace(/.*empresa\s*/, '').replace(/filtrar?\s*(por)?\s*/, ''),
      availableOptions.empresas
    )
    // Direct mention of FISA or AEF
    if (!match) {
      if (text.includes('fisa')) {
        const fisaMatch = findMatch('fisa', availableOptions.empresas)
        if (fisaMatch) return { action: 'filter', message: `Empresa: ${fisaMatch}`, filterKey: 'empresas', filterValue: [fisaMatch] }
      }
      if (text.includes('aef')) {
        const aefMatch = findMatch('aef', availableOptions.empresas)
        if (aefMatch) return { action: 'filter', message: `Empresa: ${aefMatch}`, filterKey: 'empresas', filterValue: [aefMatch] }
      }
    }
    if (match) {
      return { action: 'filter', message: `Empresa: ${match}`, filterKey: 'empresas', filterValue: [match] }
    }
  }

  // Comando: filtrar por producto
  if (text.includes('producto')) {
    const afterKeyword = text.replace(/.*producto\s*/, '')
    const match = findMatch(afterKeyword, availableOptions.productos)
    if (match) {
      return { action: 'filter', message: `Producto: ${match}`, filterKey: 'productos', filterValue: [match] }
    }
  }

  // Comando: filtrar por frontend/canal
  if (text.includes('frontend') || text.includes('front end') || text.includes('canal')) {
    const afterKeyword = text
      .replace(/.*frontend\s*/, '')
      .replace(/.*front end\s*/, '')
      .replace(/.*canal\s*/, '')
    const match = findMatch(afterKeyword, availableOptions.frontEnds)
    if (match) {
      return { action: 'filter', message: `FrontEnd: ${match}`, filterKey: 'frontEnds', filterValue: [match] }
    }
  }

  // Intento genérico: buscar en todas las opciones
  for (const empresa of availableOptions.empresas) {
    if (text.includes(normalize(empresa))) {
      return { action: 'filter', message: `Empresa: ${empresa}`, filterKey: 'empresas', filterValue: [empresa] }
    }
  }

  for (const producto of availableOptions.productos) {
    if (text.includes(normalize(producto))) {
      return { action: 'filter', message: `Producto: ${producto}`, filterKey: 'productos', filterValue: [producto] }
    }
  }

  for (const frontEnd of availableOptions.frontEnds) {
    if (text.includes(normalize(frontEnd))) {
      return { action: 'filter', message: `FrontEnd: ${frontEnd}`, filterKey: 'frontEnds', filterValue: [frontEnd] }
    }
  }

  return {
    action: 'unknown',
    message: `No entendí: "${transcript}". Prueba: "filtrar empresa FISA", "limpiar filtros"`,
  }
}
