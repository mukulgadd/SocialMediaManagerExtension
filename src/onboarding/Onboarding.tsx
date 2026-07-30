import { useState } from 'react';
import { WelcomeStep } from './steps/WelcomeStep';
import { IdentityStep } from './steps/IdentityStep';
import { ToneStep } from './steps/ToneStep';
import { ContentLibraryStep } from './steps/ContentLibraryStep';
import { CompletionStep } from './steps/CompletionStep';

const TOTAL_STEPS = 5;

export function Onboarding() {
  const [step, setStep] = useState(1);

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const back = () => setStep((s) => Math.max(s - 1, 1));

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-[600px]">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                i + 1 === step
                  ? 'bg-blue-500'
                  : i + 1 < step
                    ? 'bg-blue-800'
                    : 'bg-slate-700'
              }`}
            />
          ))}
          <span className="ml-3 text-xs text-slate-500">{step}/{TOTAL_STEPS}</span>
        </div>

        {/* Card */}
        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 shadow-xl">
          {step === 1 && <WelcomeStep onNext={next} />}
          {step === 2 && <IdentityStep onNext={next} onBack={back} />}
          {step === 3 && <ToneStep onNext={next} onBack={back} />}
          {step === 4 && <ContentLibraryStep onNext={next} onBack={back} />}
          {step === 5 && <CompletionStep onBack={back} />}
        </div>
      </div>
    </div>
  );
}
