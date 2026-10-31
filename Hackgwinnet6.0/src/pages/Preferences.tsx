import { Accessibility, ArrowLeft, ArrowRight, Contrast, Keyboard, Type, Volume2, VolumeX, MousePointer2, ListFilter } from 'lucide-react'
import { useApp } from '../state/AppContext'
import type { Preferences as PreferencesType } from '../types'
const accommodations = [
  { key: 'stepFree', label: 'Step-free access', description: 'Suggest questions about the entrance and filter for clinics that list step-free entry.', icon: Accessibility },
  { key: 'quiet', label: 'Quiet waiting preference', description: 'Find listed quiet waiting options and prepare a question to ask the clinic.', icon: VolumeX },
  { key: 'communication', label: 'Written communication', description: 'Look for written communication support and keep useful phrases close by.', icon: Keyboard },
] as const
const displayOptions = [
  { key: 'largeText', label: 'Larger text', description: 'Increase text size throughout CareNori.', icon: Type },
  { key: 'highContrast', label: 'High contrast', description: 'Strengthen text, controls, and borders. This is a light, high-contrast display.', icon: Contrast },
  { key: 'reducedMotion', label: 'Reduced motion', description: 'Turn off interface transitions. Your device preference is also respected.', icon: MousePointer2 },
  { key: 'simplified', label: 'Simplified view', description: 'Shorter instructions and less secondary information, with the same visit and tools.', icon: ListFilter },
  { key: 'readAloud', label: 'Read-aloud support', description: 'Show reading help. Audio starts only when you choose Speak or Read aloud.', icon: Volume2 },
] as const
export default function Preferences() {
  const { preferences, setPreference, navigate, t, language, setLanguage } = useApp()
  const renderOptions = (options: readonly { key: keyof PreferencesType; label: string; description: string; icon: typeof Type }[]) => options.map(option => <label className="preference-option" key={option.key}><span className="preference-icon"><option.icon size={22} aria-hidden="true" /></span><span><strong>{t(option.label)}</strong><small id={`hint-${option.key}`}>{t(option.description)}</small></span><input type="checkbox" aria-label={t(option.label)} aria-describedby={`hint-${option.key}`} checked={preferences[option.key]} onChange={e => setPreference(option.key, e.target.checked)} /></label>)
  return <div className="preferences-page"><button className="back-link" onClick={() => navigate('care')}><ArrowLeft size={16} aria-hidden="true" />{t('Back to My care')}</button><div className="page-heading"><div><p className="eyebrow">{t('OPTIONAL. ALWAYS YOUR CHOICE.')}</p><h1 tabIndex={-1}>{t('Preferences')}</h1><p className="page-description">{t('Make this space work for you. No diagnosis or account needed.')}</p></div></div>
    <div className="preferences-columns"><section className="panel" aria-labelledby="accommodation-title"><p className="eyebrow">{t('FOR YOUR VISIT')}</p><h2 id="accommodation-title">{t('Accommodation requests')}</h2><p className="muted">{t('These help you plan questions and find clinics. They are requests to check, not confirmed arrangements.')}</p><div className="preference-options">{renderOptions(accommodations)}</div><div className="inline-notice"><p>{t('Nothing is automatically shown to staff. Choose the statements you want on your access card.')}</p></div><button className="text-link" onClick={() => navigate('access')}>{t('Choose and preview my access card')}<ArrowRight size={17} aria-hidden="true" /></button></section>
      <section className="panel" aria-labelledby="display-title"><p className="eyebrow">{t('FOR THIS APP')}</p><h2 id="display-title">{t('Interface preferences')}</h2><p className="muted">{t('These settings change the app and are remembered on this device.')}</p><div className="preference-options">{renderOptions(displayOptions)}</div><label className="field-label" htmlFor="preferences-language">{t('App language')}</label><select id="preferences-language" className="input" value={language} onChange={e => setLanguage(e.target.value as 'en' | 'es')}><option value="en">English</option><option value="es">Español</option></select><p className="small-note">{t('Built-in sample content is translated. Your own words and uploaded files are never translated automatically.')}</p></section></div>
    <div className="preference-footer"><p className="small-note">{t('Changes apply immediately. Access requests stay in this session and are cleared on refresh.')}</p><button className="btn btn-primary" onClick={() => navigate('care')}>{t('Return to My care')}<ArrowRight size={17} aria-hidden="true" /></button></div>
  </div>
}
