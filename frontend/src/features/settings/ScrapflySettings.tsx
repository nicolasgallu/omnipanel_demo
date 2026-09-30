// Configuración > Scrapfly (Figma): un solo campo para el token del negocio.
// Sin guía de pasos ni onboarding — el token lo carga y cambia el negocio.
//
// Backend: GET/PUT /api/settings/scrapfly. Se guarda en
// businesses.config -> scrapfly_api_key.

import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api/endpoints'
import { ErrorBox, SpinnerText } from '../../components/ui'
import { CardHeader, OnbInput, PrimaryBtn, SavedBanner, SettingsCard } from './settingsShared'

export function ScrapflySettings() {
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [initial, setInitial] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    adminApi
      .scrapfly()
      .then((s) => {
        if (!alive) return
        setApiKey(s.api_key ?? '')
        setInitial(s.api_key ?? '')
        setLoading(false)
      })
      .catch((e: Error) => {
        if (!alive) return
        setLoadErr(e.message)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const dirty = !loading && apiKey !== initial

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setErr(null)
    setSaved(false)
    try {
      await adminApi.saveScrapfly(apiKey.trim())
      setInitial(apiKey.trim())
      setSaved(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsCard>
      <CardHeader
        title="Token de Scrapfly"
        icon={
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="10" cy="10" r="6.5" />
            <circle cx="10" cy="10" r="3" />
            <circle cx="10" cy="10" r="0.4" fill="currentColor" />
          </svg>
        }
      />
      {loading ? (
        loadErr ? <ErrorBox message={loadErr} /> : <SpinnerText text="Cargando token…" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <OnbInput
              label="API key de Scrapfly"
              value={apiKey}
              onChange={(v) => {
                setApiKey(v)
                setSaved(false)
              }}
              placeholder="Pegá tu API key de Scrapfly"
              secret
              mono
            />
            <span className="text-xs text-faint">
              Se usa para las búsquedas de precios de la competencia. Es tu token: lo cargás y lo podés cambiar cuando quieras.
            </span>
          </div>
          {err && <ErrorBox message={err} />}
          <div className="flex items-center justify-end gap-3">
            {saved && !dirty && <SavedBanner>Token guardado</SavedBanner>}
            <PrimaryBtn onClick={save} disabled={!dirty} busy={saving}>
              Guardar cambios
            </PrimaryBtn>
          </div>
        </div>
      )}
    </SettingsCard>
  )
}
