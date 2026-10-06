export function getModelBrand(modelName = '', provider = '') {
  const name = (modelName || '').toLowerCase();
  const prov = (provider || '').toLowerCase();

  if (
    name.includes('claude') ||
    name.includes('anthropic') ||
    name.includes('sonnet') ||
    name.includes('opus') ||
    name.includes('haiku') ||
    name.includes('fable') ||
    prov === 'claude'
  ) {
    return 'anthropic';
  }

  if (
    name.includes('gemini') ||
    name.includes('google')
  ) {
    return 'google';
  }

  if (
    name.includes('grok') ||
    name.includes('x-ai') ||
    name.includes('xai')
  ) {
    return 'xai';
  }

  if (
    name.includes('antigravity') ||
    name.includes('agy') ||
    name.includes('deepmind') ||
    prov === 'antigravity'
  ) {
    return 'antigravity';
  }

  if (
    name.includes('gpt') ||
    name.includes('openai') ||
    name.includes('chatgpt') ||
    name.includes('codex') ||
    name.includes('sol') ||
    name.includes('astra') ||
    name.includes('terra') ||
    name.includes('luna') ||
    name.includes('o1') ||
    name.includes('o3') ||
    name.includes('o4') ||
    prov === 'codex'
  ) {
    return 'openai';
  }

  return 'generic';
}

export default function ModelIcon({ model = '', provider = '', size = 16, className = '' }) {
  const brand = getModelBrand(model, provider);

  switch (brand) {
    case 'openai':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`model-icon icon-openai ${className}`}
          title="OpenAI"
        >
          {/* OpenAI rosette emblem */}
          <path d="M12 2a4 4 0 0 1 3.86 2.65l.38 1.15a4 4 0 0 1 2.38 4.75l-.3 1.18a4 4 0 0 1-.95 5.23l-.93.75a4 4 0 0 1-4.44.57V17a3 3 0 0 0 2.45-.63 3 3 0 0 0 .93-2.37l-.14-.54a1 1 0 0 1 .49-1.12l.98-.56a2 2 0 0 0 .94-2.27 2 2 0 0 0-1.74-1.51l-1.13-.08a1 1 0 0 1-.92-.61l-.47-1.03a2 2 0 0 0-2.03-1.28H12z" />
          <path d="M12 22a4 4 0 0 1-3.86-2.65l-.38-1.15a4 4 0 0 1-2.38-4.75l.3-1.18a4 4 0 0 1 .95-5.23l.93-.75a4 4 0 0 1 4.44-.57V7a3 3 0 0 0-2.45.63 3 3 0 0 0-.93 2.37l.14.54a1 1 0 0 1-.49 1.12l-.98.56a2 2 0 0 0-.94 2.27 2 2 0 0 0 1.74 1.51l1.13.08a1 1 0 0 1 .92.61l.47 1.03a2 2 0 0 0 2.03 1.28H12z" />
          <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
        </svg>
      );

    case 'anthropic':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="currentColor"
          className={`model-icon icon-anthropic ${className}`}
          title="Anthropic / Claude"
        >
          {/* Claude / Anthropic Warm Asterisk / Sunburst */}
          <path d="M13.8 2.5h-3.6l1.2 5.8 4.6-3.8-2.2-2zm-6.2 3.3l-2.2 2 4.6 3.8 1.2-5.8h-3.6zm-5.1 7.2l.8 3.5 5.5-2.2-2.9-5.2-3.4 3.9zm4.3 8.5l3.2 1.7 2.3-5.5-5.5.9zm10.4 1.7l3.2-1.7-2.3-5.5-5.5-.9 4.6 8.1zm5.3-9.2l.8-3.5-3.4-3.9-2.9 5.2 5.5 2.2z" />
        </svg>
      );

    case 'google':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="currentColor"
          className={`model-icon icon-gemini ${className}`}
          title="Google Gemini"
        >
          {/* Gemini Sparkling 4-point Diamond */}
          <path d="M12 2C12 7.52 7.52 12 2 12c5.52 0 10 4.48 10 10 0-5.52 4.48-10 10-10-5.52 0-10-4.48-10-10z" />
        </svg>
      );

    case 'xai':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`model-icon icon-grok ${className}`}
          title="xAI Grok"
        >
          {/* Grok geometric X */}
          <path d="M4 4l16 16M4 20l6.5-6.5M20 4l-6.5 6.5" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
      );

    case 'antigravity':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`model-icon icon-antigravity ${className}`}
          title="Antigravity"
        >
          {/* Antigravity floating prism */}
          <polygon points="12 2 22 19 2 19" />
          <polygon points="12 9 17 18 7 18" />
        </svg>
      );

    default:
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`model-icon icon-generic ${className}`}
          title="AI Model"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19" />
        </svg>
      );
  }
}
