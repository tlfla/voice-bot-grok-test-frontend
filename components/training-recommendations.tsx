'use client'

interface TrainingRecommendation {
  course: string
  module: string
  topic: string
  url: string
  section_note: string
  reason: string
}

interface TrainingRecommendationsProps {
  recommendations: TrainingRecommendation[]
}

export default function TrainingRecommendations({ recommendations }: TrainingRecommendationsProps) {
  if (!recommendations || recommendations.length === 0) {
    return null
  }

  return (
    <div className="pt-3 border-t border-form-border-light">
      <h4 className="font-medium text-form-text-dark text-sm mb-3 flex items-center gap-2">
        📚 Recommended Training
      </h4>
      
      <p className="text-xs text-form-text-gray mb-3">
        Based on your performance, here are specific lessons to review:
      </p>
      
      <div className="space-y-3">
        {recommendations.map((rec, idx) => (
          <a 
            key={idx}
            href={rec.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 bg-form-off-white hover:bg-form-gold-light border border-form-border-light hover:border-form-gold-muted rounded-lg transition-all duration-200 group"
          >
            <div className="space-y-2">
              {/* Course Badge */}
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-semibold text-form-gold-muted bg-white px-2 py-1 rounded uppercase tracking-wide">
                  {rec.course}
                </span>
                <span className="text-form-gold-muted group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </div>
              
              {/* Topic Title */}
              <h5 className="font-medium text-form-text-dark text-sm leading-snug">
                {rec.topic}
              </h5>
              
              {/* Why This Lesson */}
              {rec.reason && (
                <p className="text-xs text-form-text-dark leading-relaxed">
                  <strong className="text-form-text-dark">Why:</strong> {rec.reason}
                </p>
              )}
              
              {/* How to Find It */}
              {rec.section_note && (
                <div className="flex items-start gap-2 text-xs text-form-text-gray bg-white px-2 py-1.5 rounded border-l-2 border-form-gold-muted">
                  <span className="flex-shrink-0">💡</span>
                  <span>{rec.section_note}</span>
                </div>
              )}
            </div>
          </a>
        ))}
      </div>
      
      {/* Optional: Quick Access to Training Hub */}
      <div className="mt-4 pt-3 border-t border-form-border-light text-center">
        <a 
          href="https://www.getempowerai.com/training-hub"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs font-medium text-form-gold-muted hover:text-form-gold-dark transition-colors"
        >
          View All Training Courses →
        </a>
      </div>
    </div>
  )
}
