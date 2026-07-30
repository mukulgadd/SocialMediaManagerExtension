interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="text-center">
      <div className="text-5xl mb-4">🚀</div>
      <h1 className="text-2xl font-bold text-slate-100 mb-2">Social Media Manager</h1>
      <p className="text-slate-400 mb-6">
        Your AI-powered engagement assistant for LinkedIn and X
      </p>

      <ul className="text-left space-y-3 mb-8 max-w-sm mx-auto">
        <li className="flex items-start gap-3">
          <span className="text-green-400 mt-0.5">✓</span>
          <span className="text-sm text-slate-300">Get AI-generated replies that match your voice</span>
        </li>
        <li className="flex items-start gap-3">
          <span className="text-green-400 mt-0.5">✓</span>
          <span className="text-sm text-slate-300">Surface the most relevant posts in your feed</span>
        </li>
        <li className="flex items-start gap-3">
          <span className="text-green-400 mt-0.5">✓</span>
          <span className="text-sm text-slate-300">Stay within healthy engagement limits</span>
        </li>
        <li className="flex items-start gap-3">
          <span className="text-green-400 mt-0.5">✓</span>
          <span className="text-sm text-slate-300">Link your content library for context-aware responses</span>
        </li>
      </ul>

      <button
        onClick={onNext}
        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
      >
        Get Started
      </button>
    </div>
  );
}
