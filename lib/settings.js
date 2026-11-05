import path from 'node:path'
import { readJson, writeJson } from './util.js'

// The plugin keeps its own model preference in the data directory instead of
// rewriting the profile patch: switching models is an everyday action, while
// the profile patch is deployment configuration shared by every session.
export const SETTINGS_FILE = 'settings.json'
export const AUTOMATIC_EFFORT = 'auto'

function cleanText(value, max = 120) {
  return String(value || '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, max)
}

/** Normalize one `{ provider, model, reasoningEffort }` preference. */
export function normalizePreference(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    provider: cleanText(source.provider),
    model: cleanText(source.model),
    // Empty means "follow the model's default effort".
    reasoningEffort: cleanText(source.reasoningEffort, 24),
  }
}

export function settingsPath(dataDir) {
  return path.join(dataDir, SETTINGS_FILE)
}

export async function readPreference(dataDir) {
  const raw = await readJson(settingsPath(dataDir), {})
  return normalizePreference(raw?.model)
}

/**
 * Persist the preference while keeping unrelated keys in settings.json.
 * Returns the normalized value that was written.
 */
export async function writePreference(dataDir, preference) {
  const file = settingsPath(dataDir)
  const existing = (await readJson(file, {})) || {}
  const next = typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {}
  next.model = normalizePreference(preference)
  await writeJson(file, next)
  return next.model
}

function isAutomatic(value) {
  const text = cleanText(value, 24).toLowerCase()
  return !text || text === AUTOMATIC_EFFORT || text === 'default'
}

/**
 * Choose the reasoning effort for one call.
 *
 * Precedence: the user's explicit pick, then the model's own default (so a
 * fresh model switch tracks that model), then the deployment config, then
 * `low` (the cheapest broadly supported effort).
 *
 * `supported` is the capability contract: an array means the model advertises
 * exactly those efforts (an empty array means it supports none), while
 * `undefined` means its capabilities are unknown and the pick is honoured.
 * A value the model does not advertise is skipped, never forwarded, so
 * switching to a model with fewer effort levels never breaks a call.
 */
export function resolveEffort({ explicit, configured, modelDefault, supported } = {}) {
  const known = Array.isArray(supported)
  const allowed = known ? supported.filter(Boolean).map(String) : []
  const accept = (value) => {
    if (isAutomatic(value)) return ''
    const text = cleanText(value, 24)
    if (!known) return text
    return allowed.includes(text) ? text : ''
  }
  return (
    accept(explicit) ||
    accept(modelDefault) ||
    accept(configured) ||
    (allowed.includes('low') ? 'low' : '')
  )
}
