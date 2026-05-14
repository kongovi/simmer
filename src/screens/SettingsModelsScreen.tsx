import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react'
import { Screen } from '../components/layout/Screen'
import { useUserSettings, useUpdateAISettings } from '../hooks/useUserSettings'
import type { AIModel, ImageModel, AITask } from '../types'

// ── Label maps ────────────────────────────────────────────────────────────────

const TEXT_MODELS: { value: AIModel; label: string; subtitle: string }[] = [
  { value: 'claude',  label: 'Claude',   subtitle: 'Anthropic — recommended' },
  { value: 'gpt4',    label: 'GPT-4o',   subtitle: 'OpenAI' },
  { value: 'gemini',  label: 'Gemini',   subtitle: 'Google' },
  { value: 'local',   label: 'Ollama',   subtitle: 'Local — runs on your machine' },
]

const IMAGE_MODELS: { value: ImageModel | 'none'; label: string; subtitle: string }[] = [
  { value: 'nano-banana-2',   label: 'Nano Banana 2',   subtitle: 'Gemini Flash · default' },
  { value: 'nano-banana-pro', label: 'Nano Banana Pro', subtitle: 'Gemini Imagen 3' },
  { value: 'nano-banana',     label: 'Nano Banana',     subtitle: 'Gemini 2.0 Flash' },
  { value: 'dalle',           label: 'DALL·E 3',        subtitle: 'OpenAI' },
  { value: 'flux',            label: 'FLUX',            subtitle: 'Replicate' },
  { value: 'none',            label: 'None',            subtitle: 'Skip image generation' },
]

const TASKS: { value: AITask; label: string }[] = [
  { value: 'recipe_structuring',  label: 'Recipe structuring' },
  { value: 'grocery_intelligence', label: 'Grocery intelligence' },
  { value: 'meal_plan_parsing',   label: 'Meal plan parsing' },
  { value: 'staple_prediction',   label: 'Staple prediction' },
]

// ── Key field ─────────────────────────────────────────────────────────────────

function KeyField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label:       string
  value:       string
  onChange:    (v: string) => void
  placeholder: string
}) {
  const [show, setShow] = useState(false)

  return (
    <div style={{ padding: '10px 14px 12px', borderTop: '0.5px solid var(--br)' }}>
      <div style={{ fontSize: '11px', color: 'var(--ts)', marginBottom: '6px' }}>{label}</div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        background: 'var(--dk3)', border: '0.5px solid var(--brh)',
        borderRadius: '8px', padding: '8px 10px',
      }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            fontSize: '12px', color: 'var(--tp)', fontFamily: 'monospace',
          }}
        />
        <button
          onClick={() => setShow(s => !s)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}
        >
          {show
            ? <EyeOff size={14} color="var(--tm)" />
            : <Eye    size={14} color="var(--tm)" />
          }
        </button>
      </div>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{
        fontSize: '11px', fontWeight: 600, color: 'var(--tm)',
        textTransform: 'uppercase', letterSpacing: '0.8px',
        marginBottom: '8px', paddingLeft: '4px',
      }}>
        {title}
      </div>
      <div style={{
        background: 'var(--dkc)',
        border: '0.5px solid var(--br)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

// ── Model radio row ────────────────────────────────────────────────────────────

function ModelRow<T extends string>({
  label, subtitle, selected, onSelect,
}: {
  value: T; label: string; subtitle: string; selected: boolean; onSelect: () => void
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '11px 14px',
        borderBottom: '0.5px solid var(--br)',
        cursor: 'pointer',
        background: selected ? 'rgba(123,175,138,0.06)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <div style={{
        width: '18px', height: '18px', borderRadius: '50%',
        border: `2px solid ${selected ? 'var(--am)' : 'var(--tm)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {selected && (
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--am)' }} />
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', color: 'var(--tp)', fontWeight: selected ? 500 : 400 }}>{label}</div>
        <div style={{ fontSize: '11px', color: 'var(--ts)' }}>{subtitle}</div>
      </div>
    </div>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function SettingsModelsScreen() {
  const navigate  = useNavigate()
  const { data: settings, isLoading } = useUserSettings()
  const updateAI  = useUpdateAISettings()

  // Local state
  const [textModel,       setTextModel]       = useState<AIModel>('claude')
  const [imageModel,      setImageModel]       = useState<ImageModel | 'none'>('nano-banana-2')
  const [anthropicKey,    setAnthropicKey]     = useState('')
  const [openaiKey,       setOpenaiKey]        = useState('')
  const [googleKey,       setGoogleKey]        = useState('')
  const [replicateKey,    setReplicateKey]     = useState('')
  const [ollamaHost,      setOllamaHost]       = useState('')
  const [taskOverrides,   setTaskOverrides]    = useState<Record<string, string>>({})
  const [advancedOpen,    setAdvancedOpen]     = useState(false)
  const [saved,           setSaved]            = useState(false)

  // Populate from loaded settings
  useEffect(() => {
    if (!settings) return
    setTextModel(settings.ai_structuring_model ?? 'claude')
    setImageModel(settings.ai_image_model ?? 'nano-banana-2')
    setAnthropicKey(settings.anthropic_api_key_enc ?? '')
    setOpenaiKey(settings.openai_api_key_enc ?? '')
    setGoogleKey(settings.google_api_key_enc ?? '')
    setReplicateKey(settings.replicate_api_key_enc ?? '')
    setOllamaHost(settings.ollama_host ?? '')
    setTaskOverrides(settings.task_model_overrides ?? {})
  }, [settings])

  async function handleSave() {
    await updateAI.mutateAsync({
      ai_structuring_model:  textModel,
      ai_image_model:        imageModel === 'none' ? undefined : imageModel as ImageModel,
      anthropic_api_key_enc: anthropicKey  || null,
      openai_api_key_enc:    openaiKey     || null,
      google_api_key_enc:    googleKey     || null,
      replicate_api_key_enc: replicateKey  || null,
      ollama_host:           ollamaHost    || null,
      task_model_overrides:  taskOverrides,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (isLoading) return (
    <Screen>
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '48px' }}>
        <div style={{ width: '20px', height: '20px', border: '2px solid var(--br)', borderTopColor: 'var(--am)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
    </Screen>
  )

  return (
    <Screen>
      <div style={{ padding: '16px 16px 0', maxWidth: '480px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <button
            onClick={() => navigate('/settings')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0, color: 'var(--am)' }}
          >
            <ArrowLeft size={20} />
          </button>
          <span style={{ fontSize: '17px', fontWeight: 600, color: 'var(--tp)' }}>AI Models</span>
        </div>

        {/* Text AI */}
        <Section title="Text AI">
          {TEXT_MODELS.map(m => (
            <ModelRow
              key={m.value}
              value={m.value}
              label={m.label}
              subtitle={m.subtitle}
              selected={textModel === m.value}
              onSelect={() => setTextModel(m.value)}
            />
          ))}
          {/* Key inputs for the selected model */}
          {textModel === 'claude' && (
            <KeyField
              label="Anthropic API key"
              value={anthropicKey}
              onChange={setAnthropicKey}
              placeholder="sk-ant-…"
            />
          )}
          {textModel === 'gpt4' && (
            <KeyField
              label="OpenAI API key"
              value={openaiKey}
              onChange={setOpenaiKey}
              placeholder="sk-…"
            />
          )}
          {textModel === 'gemini' && (
            <KeyField
              label="Google AI API key"
              value={googleKey}
              onChange={setGoogleKey}
              placeholder="AIza…"
            />
          )}
          {textModel === 'local' && (
            <div style={{ padding: '10px 14px 12px', borderTop: '0.5px solid var(--br)' }}>
              <div style={{ fontSize: '11px', color: 'var(--ts)', marginBottom: '6px' }}>Ollama host URL</div>
              <div style={{
                display: 'flex', alignItems: 'center',
                background: 'var(--dk3)', border: '0.5px solid var(--brh)',
                borderRadius: '8px', padding: '8px 10px',
              }}>
                <input
                  type="text"
                  value={ollamaHost}
                  onChange={e => setOllamaHost(e.target.value)}
                  placeholder="http://localhost:11434"
                  style={{
                    flex: 1, background: 'none', border: 'none', outline: 'none',
                    fontSize: '12px', color: 'var(--tp)', fontFamily: 'monospace',
                  }}
                />
              </div>
            </div>
          )}
        </Section>

        {/* Image AI */}
        <Section title="Image AI">
          {IMAGE_MODELS.map(m => (
            <ModelRow
              key={m.value}
              value={m.value}
              label={m.label}
              subtitle={m.subtitle}
              selected={imageModel === m.value}
              onSelect={() => setImageModel(m.value as ImageModel | 'none')}
            />
          ))}
          {(imageModel === 'nano-banana-2' || imageModel === 'nano-banana-pro' || imageModel === 'nano-banana') && (
            <KeyField
              label="Google AI API key"
              value={googleKey}
              onChange={setGoogleKey}
              placeholder="AIza…"
            />
          )}
          {imageModel === 'dalle' && (
            <KeyField
              label="OpenAI API key"
              value={openaiKey}
              onChange={setOpenaiKey}
              placeholder="sk-…"
            />
          )}
          {imageModel === 'flux' && (
            <KeyField
              label="Replicate API key"
              value={replicateKey}
              onChange={setReplicateKey}
              placeholder="r8_…"
            />
          )}
        </Section>

        {/* Per-task overrides (collapsible) */}
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={() => setAdvancedOpen(o => !o)}
            style={{
              width: '100%', background: 'none', border: 'none',
              cursor: 'pointer', padding: '8px 4px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            <span style={{
              fontSize: '11px', fontWeight: 600, color: 'var(--tm)',
              textTransform: 'uppercase', letterSpacing: '0.8px',
            }}>
              Per-task overrides
            </span>
            {advancedOpen
              ? <ChevronUp   size={14} color="var(--tm)" />
              : <ChevronDown size={14} color="var(--tm)" />
            }
          </button>
          {advancedOpen && (
            <div style={{
              background: 'var(--dkc)', border: '0.5px solid var(--br)',
              borderRadius: '12px', overflow: 'hidden',
            }}>
              {TASKS.map((task, idx) => (
                <div
                  key={task.value}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '12px', padding: '11px 14px',
                    borderBottom: idx < TASKS.length - 1 ? '0.5px solid var(--br)' : 'none',
                  }}
                >
                  <span style={{ fontSize: '13px', color: 'var(--tp)' }}>{task.label}</span>
                  <select
                    value={taskOverrides[task.value] ?? ''}
                    onChange={e => {
                      const v = e.target.value
                      setTaskOverrides(prev => {
                        const next = { ...prev }
                        if (v) next[task.value] = v
                        else delete next[task.value]
                        return next
                      })
                    }}
                    style={{
                      background: 'var(--dk3)', border: '0.5px solid var(--brh)',
                      borderRadius: '7px', padding: '5px 8px',
                      color: 'var(--tp)', fontSize: '12px',
                      fontFamily: 'inherit', cursor: 'pointer',
                    }}
                  >
                    <option value="">Default ({TEXT_MODELS.find(m => m.value === textModel)?.label})</option>
                    {TEXT_MODELS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={updateAI.isPending}
          style={{
            width: '100%', padding: '13px',
            background: saved ? 'rgba(123,175,138,0.2)' : 'var(--am)',
            border: saved ? '0.5px solid var(--am)' : 'none',
            borderRadius: '12px',
            color: saved ? 'var(--am)' : '#141820',
            fontSize: '14px', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.2s',
            marginBottom: '32px',
          }}
        >
          {updateAI.isPending ? 'Saving…' : saved ? '✓ Saved' : 'Save settings'}
        </button>
      </div>
    </Screen>
  )
}
