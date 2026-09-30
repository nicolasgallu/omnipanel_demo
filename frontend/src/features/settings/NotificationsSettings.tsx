// Configuración > Notificaciones (Figma): canales de destino (WhatsApp vía
// Whapi + Telegram) y qué eventos recibir por cada canal.
//
// Backend: GET/PUT /api/notifications/settings + POST /api/notifications/test.
// Las preferencias viven en businesses.config -> notifications. Los tokens de
// los canales son de plataforma y no viajan por esta API.

import { useEffect, useState } from 'react'
import { notificationsApi } from '../../lib/api/endpoints'
import type { NotificationEventKey, NotificationEventSetting, NotificationSettings } from '../../lib/api/types'
import { ErrorBox, SpinnerText, Toggle } from '../../components/ui'
import { CardHeader, InfoNote, OnbInput, PrimaryBtn, SavedBanner, SettingsCard } from './settingsShared'

const NOTIF_EVENTS: { key: NotificationEventKey; label: string; desc: string; hint?: string }[] = [
  { key: 'order_confirmed', label: 'Venta confirmada', desc: 'Cuando entra una venta nueva y pagada.' },
  { key: 'order_cancelled', label: 'Orden cancelada', desc: 'Cuando se cancela una venta y se revierte el stock.' },
  { key: 'order_delivered', label: 'Orden entregada', desc: 'Cuando el envío llega al comprador.' },
  {
    key: 'shipment_ready',
    label: 'Etiqueta lista para despachar',
    desc: "Cuando un envío de MercadoLibre pasa a 'Listo para enviar': mandamos la etiqueta en PDF. Si MercadoLibre todavía no la generó, avisamos por texto con el número de orden para descargarla desde la app.",
    hint: 'El PDF viaja como documento adjunto en WhatsApp y Telegram.',
  },
  { key: 'scraping_finished', label: 'Scraping finalizado', desc: 'Cuando termina una corrida de búsqueda de competencia.' },
]

const DEFAULT_EVENTS: Record<NotificationEventKey, NotificationEventSetting> = {
  order_confirmed: { whatsapp: true, telegram: true },
  order_cancelled: { whatsapp: true, telegram: true },
  order_delivered: { whatsapp: false, telegram: false },
  shipment_ready: { whatsapp: true, telegram: true },
  scraping_finished: { whatsapp: false, telegram: true },
}

export function NotificationsSettings() {
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [chatId, setChatId] = useState('')
  const [events, setEvents] = useState<Record<NotificationEventKey, NotificationEventSetting> | null>(null)
  const [initial, setInitial] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [testing, setTesting] = useState<'whatsapp' | 'telegram' | null>(null)
  const [testOk, setTestOk] = useState<'whatsapp' | 'telegram' | null>(null)
  const [testErr, setTestErr] = useState<{ channel: 'whatsapp' | 'telegram'; message: string } | null>(null)

  useEffect(() => {
    let alive = true
    notificationsApi
      .settings()
      .then((s) => {
        if (!alive) return
        setPhone(s.whatsapp_phone ?? '')
        setChatId(s.telegram_chat_id ?? '')
        setEvents(s.events)
        setInitial(JSON.stringify(s))
        setLoading(false)
      })
      .catch((err: Error) => {
        if (!alive) return
        setLoadErr(err.message)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const current = (): NotificationSettings => ({
    whatsapp_phone: phone.trim() ? phone.trim() : null,
    telegram_chat_id: chatId.trim() ? chatId.trim() : null,
    events: events ?? DEFAULT_EVENTS,
  })
  const dirty = !loading && events !== null && JSON.stringify(current()) !== initial

  const toggle = (key: NotificationEventKey, channel: 'whatsapp' | 'telegram') => {
    setSaved(false)
    setEvents((ev) => (ev ? { ...ev, [key]: { ...ev[key], [channel]: !ev[key][channel] } } : ev))
  }

  const runTest = async (channel: 'whatsapp' | 'telegram') => {
    setTesting(channel)
    setTestErr(null)
    setTestOk(null)
    try {
      await notificationsApi.test(channel)
      setTestOk(channel)
    } catch (err) {
      setTestErr({ channel, message: err instanceof Error ? err.message : 'No se pudo enviar' })
    } finally {
      setTesting(null)
    }
  }

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setSaveErr(null)
    setSaved(false)
    try {
      await notificationsApi.saveSettings(current())
      setInitial(JSON.stringify(current()))
      setSaved(true)
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  if (!events) {
    return (
      <SettingsCard>
        {loadErr ? <ErrorBox message={loadErr} /> : <SpinnerText text="Cargando notificaciones…" />}
      </SettingsCard>
    )
  }

  const waNeeded = NOTIF_EVENTS.some((e) => events[e.key].whatsapp) && !phone.trim()
  const tgNeeded = NOTIF_EVENTS.some((e) => events[e.key].telegram) && !chatId.trim()

  return (
    <>
      {/* Sección 1 — Canales */}
      <SettingsCard>
        <CardHeader
          title="Canales de notificación"
          icon={
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 3a4.5 4.5 0 0 0-4.5 4.5c0 3-1 4.5-2 5.5h13c-1-1-2-2.5-2-5.5A4.5 4.5 0 0 0 10 3z" />
              <path d="M8.2 16a2 2 0 0 0 3.6 0" />
            </svg>
          }
        />

        <div className="flex flex-col gap-6">
          {/* WhatsApp */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: '#DCFCE7', color: '#16A34A' }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M8 2a6 6 0 0 0-5.2 9l-.8 3 3.1-.8A6 6 0 1 0 8 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="text-sm font-bold text-ink">WhatsApp</span>
              <span className="text-xs text-faint">vía Whapi</span>
            </div>
            <OnbInput
              label="Número de WhatsApp"
              value={phone}
              onChange={(v) => {
                setPhone(v)
                setSaved(false)
              }}
              placeholder="+54 9 11 1234 5678"
            />
            <span className="text-xs text-faint">Los mensajes salen por la API de Whapi que provee la plataforma.</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold" style={{ color: '#4F46E5', background: '#EEF2FF' }}>
                Proporcionado por la plataforma
              </span>
              <button
                onClick={() => runTest('whatsapp')}
                disabled={testing === 'whatsapp'}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
                style={{ border: '1px solid #E2E8F0', color: '#475569', background: 'white' }}
              >
                {testing === 'whatsapp' ? 'Enviando…' : 'Enviar mensaje de prueba'}
              </button>
              {testOk === 'whatsapp' && <SavedBanner>Mensaje de prueba enviado a tu WhatsApp</SavedBanner>}
            </div>
            {testErr?.channel === 'whatsapp' && <ErrorBox message={testErr.message} />}
          </div>

          <div style={{ height: 1, background: '#F1F5F9' }} />

          {/* Telegram */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: '#E0F2FE', color: '#0284C7' }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M2 7.5 14 3l-2 10-3.5-2.5L6.5 12l-.3-2.7L11 5.5 5.6 8.8 2 7.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="text-sm font-bold text-ink">Telegram</span>
            </div>
            <OnbInput
              label="Chat ID de Telegram"
              value={chatId}
              onChange={(v) => {
                setChatId(v)
                setSaved(false)
              }}
              placeholder="123456789"
            />
            <span className="text-xs text-faint">Escribile al bot de la plataforma en Telegram y pegá el chat id que te responde.</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold" style={{ color: '#4F46E5', background: '#EEF2FF' }}>
                Proporcionado por la plataforma
              </span>
              <button
                onClick={() => runTest('telegram')}
                disabled={testing === 'telegram'}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
                style={{ border: '1px solid #E2E8F0', color: '#475569', background: 'white' }}
              >
                {testing === 'telegram' ? 'Enviando…' : 'Enviar mensaje de prueba'}
              </button>
              {testOk === 'telegram' && <SavedBanner>Mensaje de prueba enviado a Telegram</SavedBanner>}
            </div>
            {testErr?.channel === 'telegram' && <ErrorBox message={testErr.message} />}
          </div>
        </div>
      </SettingsCard>

      {/* Sección 2 — Eventos */}
      <SettingsCard>
        <CardHeader
          title="Qué querés recibir"
          icon={
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="14" height="14" rx="3" />
              <path d="M6.5 10l2 2 4.5-4.5" />
            </svg>
          }
        />

        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9' }}>
          <div className="grid items-center px-4 py-2.5" style={{ gridTemplateColumns: '1.4fr 2fr 90px 90px', background: '#F8FAFC' }}>
            {['Evento', 'Descripción', 'WhatsApp', 'Telegram'].map((h, i) => (
              <span
                key={h}
                style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8', textAlign: i >= 2 ? 'center' : 'left' }}
              >
                {h}
              </span>
            ))}
          </div>
          {NOTIF_EVENTS.map((ev, i) => (
            <div
              key={ev.key}
              className="grid items-center px-4 py-3"
              style={{ gridTemplateColumns: '1.4fr 2fr 90px 90px', borderTop: i === 0 ? 'none' : '1px solid #F8FAFC' }}
            >
              <span className="text-sm font-semibold text-ink">{ev.label}</span>
              <span className="flex flex-col gap-1">
                <span className="text-xs text-subtle">{ev.desc}</span>
                {ev.hint && (
                  <span className="text-xs" style={{ color: '#94A3B8' }}>{ev.hint}</span>
                )}
              </span>
              <div className="flex justify-center">
                <Toggle value={events[ev.key].whatsapp} onChange={() => toggle(ev.key, 'whatsapp')} />
              </div>
              <div className="flex justify-center">
                <Toggle value={events[ev.key].telegram} onChange={() => toggle(ev.key, 'telegram')} />
              </div>
            </div>
          ))}
        </div>

        {(waNeeded || tgNeeded) && (
          <div className="flex flex-col gap-2 mt-4">
            {waNeeded && <InfoNote>Configurá tu número de WhatsApp para recibir por ese canal.</InfoNote>}
            {tgNeeded && <InfoNote>Configurá tu chat id de Telegram para recibir por ese canal.</InfoNote>}
          </div>
        )}

        {saveErr && (
          <div className="mt-4">
            <ErrorBox message={saveErr} />
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-5">
          {saved && !dirty && <SavedBanner>Cambios guardados</SavedBanner>}
          <PrimaryBtn onClick={save} disabled={!dirty} busy={saving}>
            Guardar cambios
          </PrimaryBtn>
        </div>
      </SettingsCard>
    </>
  )
}
