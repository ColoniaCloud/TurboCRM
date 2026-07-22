import type { CustomFieldDefinition } from '../db/schema'

export type CustomFieldValue = string | number | boolean | null

type DefinitionLike = Pick<CustomFieldDefinition, 'key' | 'label' | 'fieldType' | 'options' | 'required'>

type ValueResult =
  | { valid: true; value: CustomFieldValue }
  | { valid: false; error: string }

type PatchResult =
  | { valid: true; values: Record<string, CustomFieldValue> }
  | { valid: false; error: string }

/**
 * Coerce y valida un valor crudo según el tipo de la definición.
 * La API es el límite de confianza — nunca confiamos en el tipo que
 * mandó el cliente.
 */
export function validateCustomFieldValue(definition: DefinitionLike, rawValue: unknown): ValueResult {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return { valid: true, value: null }
  }

  switch (definition.fieldType) {
    case 'text':
      return { valid: true, value: String(rawValue) }

    case 'number': {
      const num = Number(rawValue)
      if (Number.isNaN(num)) {
        return { valid: false, error: `"${definition.label}" debe ser un número` }
      }
      return { valid: true, value: num }
    }

    case 'boolean':
      return { valid: true, value: Boolean(rawValue) }

    case 'date': {
      const date = new Date(String(rawValue))
      if (Number.isNaN(date.getTime())) {
        return { valid: false, error: `"${definition.label}" debe ser una fecha válida` }
      }
      return { valid: true, value: date.toISOString() }
    }

    case 'select': {
      const options = definition.options ?? []
      if (!options.includes(String(rawValue))) {
        return { valid: false, error: `"${definition.label}" debe ser una de las opciones válidas` }
      }
      return { valid: true, value: String(rawValue) }
    }

    default:
      return { valid: false, error: `Tipo de campo desconocido para "${definition.label}"` }
  }
}

/**
 * Valida un patch completo de custom fields contra las definiciones
 * existentes: rechaza keys desconocidas, coerciona cada valor por tipo, y
 * opcionalmente exige los campos marcados required.
 */
export function validateCustomFieldsPatch(
  definitions: DefinitionLike[],
  patch: Record<string, unknown>,
  options: { enforceRequired?: boolean } = {},
): PatchResult {
  const definitionByKey = new Map(definitions.map((d) => [d.key, d]))
  const values: Record<string, CustomFieldValue> = {}

  for (const key of Object.keys(patch)) {
    const definition = definitionByKey.get(key)
    if (!definition) {
      return { valid: false, error: `El campo personalizado "${key}" no existe` }
    }

    const result = validateCustomFieldValue(definition, patch[key])
    if (!result.valid) {
      return result
    }
    values[key] = result.value
  }

  if (options.enforceRequired) {
    for (const definition of definitions) {
      if (definition.required && (values[definition.key] === undefined || values[definition.key] === null)) {
        return { valid: false, error: `"${definition.label}" es requerido` }
      }
    }
  }

  return { valid: true, values }
}
