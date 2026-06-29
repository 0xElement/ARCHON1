// common/schemas/validate.js
//
// A tiny, DEPENDENCY-FREE JSON-Schema-subset validator for the Autonomous Agent
// OS canonical schemas. Supports exactly the keywords the six schemas use:
//   type, enum, required, properties, items, additionalProperties (bool),
//   minItems, minLength, const.
// No $ref, no if/then, no format. ajv is NOT installed and NOT added (ULTRAPLAN
// invariant 8) — if draft-2020-12 conditionals are ever genuinely needed that is
// OPEN DECISION D-1, and nothing in this build depends on it.

'use strict'

function typeOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'number' && Number.isInteger(v)) return 'integer'
  return typeof v // number | string | boolean | object | undefined
}

function matchType(t, v) {
  const actual = typeOf(v)
  if (t === 'number') return actual === 'number' || actual === 'integer'
  if (t === 'integer') return actual === 'integer'
  return actual === t
}

function validate(schema, data, p) {
  p = p || ''
  const errors = []
  if (!schema || typeof schema !== 'object') return errors
  const at = p || '(root)'

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some(t => matchType(t, data))) {
      errors.push(`${at}: expected type ${types.join('|')}, got ${typeOf(data)}`)
      return errors // type mismatch — further checks are noise
    }
  }
  if ('const' in schema && data !== schema.const) errors.push(`${at}: must equal ${JSON.stringify(schema.const)}`)
  if (Array.isArray(schema.enum) && !schema.enum.some(e => e === data)) {
    errors.push(`${at}: ${JSON.stringify(data)} not in enum [${schema.enum.join(', ')}]`)
  }

  const kind = typeOf(data)
  if (kind === 'string' && schema.minLength != null && data.length < schema.minLength) {
    errors.push(`${at}: string shorter than minLength ${schema.minLength}`)
  }
  if (kind === 'array') {
    if (schema.minItems != null && data.length < schema.minItems) errors.push(`${at}: fewer than minItems ${schema.minItems}`)
    if (schema.items) data.forEach((it, i) => errors.push(...validate(schema.items, it, `${p}[${i}]`)))
  }
  if (kind === 'object') {
    if (Array.isArray(schema.required)) {
      for (const k of schema.required) if (!(k in data)) errors.push(`${at}: missing required '${k}'`)
    }
    if (schema.properties) {
      for (const [k, sub] of Object.entries(schema.properties)) {
        if (k in data) errors.push(...validate(sub, data[k], p ? `${p}.${k}` : k))
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties))
      for (const k of Object.keys(data)) if (!allowed.has(k)) errors.push(`${at}: additional property '${k}' not allowed`)
    }
  }
  return errors
}

function isValid(schema, data) { return validate(schema, data).length === 0 }

module.exports = { validate, isValid }
