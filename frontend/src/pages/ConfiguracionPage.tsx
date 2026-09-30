import { useEffect, useRef, useState } from 'react'
import { adminApi } from '../lib/api/endpoints'
import { fileToPngBlob } from '../lib/image'
import { ErrorBox, SpinnerText } from '../components/ui'
import { NavIcon } from '../components/NavIcon'
import type { NavIconKey } from '../components/NavIcon'
import { CardHeader, SettingsCard } from '../features/settings/settingsShared'
import { MeliSettings } from '../features/settings/MeliSettings'
import { TiendaNubeSettings } from '../features/settings/TiendaNubeSettings'
import { NotificationsSettings } from '../features/settings/NotificationsSettings'
import { ScrapflySettings } from '../features/settings/ScrapflySettings'
import { ImsSettings } from '../features/settings/ImsSettings'

type SettingsTab = 'general' | 'meli' | 'tn' | 'notificaciones' | 'scrapfly' | 'ims'

const SETTINGS_TABS: { key: SettingsTab; label: string; icon: NavIconKey }[] = [
  { key: 'general', label: 'General', icon: 'configuracion' },
  { key: 'meli', label: 'MercadoLibre', icon: 'ml' },
  { key: 'tn', label: 'Tienda Nube', icon: 'tn' },
  { key: 'notificaciones', label: 'Notificaciones', icon: 'notificaciones' },
  { key: 'scrapfly', label: 'Scrapfly', icon: 'competencia' },
  { key: 'ims', label: 'Integración inventario', icon: 'inventario' },
]

export function ConfiguracionPage() {
  const [tab, setTab] = useState<SettingsTab>('general')

  return (
    <div className="flex-1 overflow-y-auto scroll-slim">
      <div className="max-w-5xl mx-auto px-8 py-8 flex flex-col gap-5">
        <h1 className="text-2xl font-bold text-ink">Configuración</h1>

        {/* Subtab bar (Figma) */}
        <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: '#F1F5F9' }}>
          {SETTINGS_TABS.map((t) => {
            const on = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: on ? 'white' : 'transparent',
                  color: on ? '#4F46E5' : '#64748B',
                  boxShadow: on ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <span style={{ display: 'flex', opacity: on ? 1 : 0.7 }}>
                  <NavIcon name={t.icon} size={15} />
                </span>
                {t.label}
              </button>
            )
          })}
        </div>

        {tab === 'general' && <GeneralSettings />}
        {tab === 'meli' && <MeliSettings />}
        {tab === 'tn' && <TiendaNubeSettings />}
        {tab === 'notificaciones' && <NotificationsSettings />}
        {tab === 'scrapfly' && <ScrapflySettings />}
        {tab === 'ims' && <ImsSettings />}
      </div>
    </div>
  )
}

// ─── General: credenciales de acceso + logo ──────────────────────────────────

function GeneralSettings() {
  const [email, setEmail] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    adminApi
      .settings()
      .then((res) => {
        setEmail(res.email || '')
        setLogoUrl(res.logo_url)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const savePassword = async () => {
    if (newPassword !== confirmPassword) {
      setError('La nueva contraseña y su confirmación no coinciden')
      return
    }
    if (newPassword.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres')
      return
    }
    setSavingPw(true)
    setError(null)
    setSavedMsg(null)
    try {
      await adminApi.changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSavedMsg('Contraseña actualizada correctamente')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña')
    } finally {
      setSavingPw(false)
    }
  }

  const onLogoPicked = async (file: File | null) => {
    if (!file) return
    setUploadingLogo(true)
    setError(null)
    setSavedMsg(null)
    try {
      const png = await fileToPngBlob(file, 400)
      const res = await adminApi.uploadLogo(png)
      setLogoUrl(res.logo_url)
      setSavedMsg('Logo actualizado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  if (loading) return <SpinnerText />

  return (
    <>
      {error && <ErrorBox message={error} />}
      {savedMsg && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold animate-fade-in"
          style={{ background: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0' }}
        >
          ✓ {savedMsg}
        </div>
      )}

      <SettingsCard>
        <CardHeader
          title="Credenciales de Acceso"
          icon={
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="10" cy="6.5" r="3" />
              <path d="M4 16.5c0-3 2.7-5 6-5s6 2 6 5" />
            </svg>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div className="flex flex-col gap-1.5">
            <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>
              Usuario
            </span>
            <input
              type="text"
              value={email}
              disabled
              className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none opacity-60 text-ink"
              style={{ border: '1px solid #E2E8F0', background: '#F8FAFC' }}
            />
          </div>
          <PwField label="Contraseña actual" value={currentPassword} onChange={setCurrentPassword} placeholder="••••••••" />
          <PwField label="Nueva contraseña" value={newPassword} onChange={setNewPassword} placeholder="••••••••" />
          <PwField label="Confirmar nueva" value={confirmPassword} onChange={setConfirmPassword} placeholder="••••••••" />
        </div>
        <div className="flex justify-end mt-5">
          <button
            onClick={savePassword}
            disabled={savingPw || !currentPassword || !newPassword}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:opacity-60"
            style={{ background: '#4F46E5' }}
          >
            {savingPw ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </SettingsCard>

      <SettingsCard>
        <CardHeader
          title="Personalización de Logo"
          icon={
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
              <circle cx="7" cy="8" r="1.5" />
              <path d="M3 14l4-4 3 3 3-3 4 4" />
            </svg>
          }
        />
        <div className="flex items-center gap-4">
          <div
            className="flex items-center justify-center rounded-xl flex-shrink-0 overflow-hidden"
            style={{ width: 72, height: 72, background: '#F8FAFC', border: '1px solid #E2E8F0' }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <span className="text-xs font-bold tracking-wide text-faint">LOGO</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
              className="w-fit px-4 py-2 rounded-xl text-sm font-medium transition-colors text-subtle"
              style={{ border: '1px solid #E2E8F0', background: 'white' }}
            >
              {uploadingLogo ? 'Subiendo…' : 'Subir'}
            </button>
            <p className="text-xs text-muted">PNG o SVG con fondo transparente. Se usará en toda la aplicación.</p>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onLogoPicked(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
      </SettingsCard>
    </>
  )
}

function PwField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>
        {label}
      </span>
      <input
        type="password"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all text-ink placeholder:text-faint"
        style={{ border: '1px solid #E2E8F0', background: 'white' }}
        onFocus={(e) => {
          e.target.style.borderColor = '#4F46E5'
          e.target.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.1)'
        }}
        onBlur={(e) => {
          e.target.style.borderColor = '#E2E8F0'
          e.target.style.boxShadow = 'none'
        }}
      />
    </div>
  )
}
