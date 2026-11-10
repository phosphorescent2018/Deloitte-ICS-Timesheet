import { useEffect, useState } from 'react';
import { useI18n } from './i18n';
import mindigitalMark from './assets/mindigital-mark.svg';
import wecomMark from './assets/wecom.png';
import { Icon, Modal } from './ui';

interface Props {
  onLogin: () => void;
  onFeedback: (content: string) => void;
}

export default function LoginPage({ onLogin, onFeedback }: Props) {
  const { t, lang, setLang } = useI18n();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    if (!feedbackSent) return;
    const timer = window.setTimeout(() => setFeedbackSent(false), 2800);
    return () => window.clearTimeout(timer);
  }, [feedbackSent]);

  const submitFeedback = () => {
    const content = feedbackText.trim();
    if (!content) return;
    onFeedback(content);
    setFeedbackText('');
    setFeedbackOpen(false);
    setFeedbackSent(true);
  };

  return (
    <div className="login-page">
      <section className="login-brand">
        <div className="login-brand-head">
          <img src={mindigitalMark} alt="" />
          <div className="login-brand-name">
            Mindigital
            <span>GLOBAL DELIVERY CENTER</span>
          </div>
        </div>

        <div className="login-brand-copy">
          <span className="login-kicker">INTERNAL CLIENT SERVICE</span>
          <h1>{t('login.brandTitle')}</h1>
          <p>{t('login.brandSubtitle')}</p>
        </div>

        <p className="login-copyright">© 2026 Mindigital</p>
      </section>

      <section className="login-panel">
        <div className="login-lang" role="group" aria-label={t('app.lang')}>
          <button
            type="button"
            className={lang === 'zh' ? 'is-active' : undefined}
            onClick={() => setLang('zh')}
          >
            中文
          </button>
          <button
            type="button"
            className={lang === 'en' ? 'is-active' : undefined}
            onClick={() => setLang('en')}
          >
            EN
          </button>
        </div>

        <div className="login-card">
          <h2>{t('login.title')}</h2>
          <p className="login-sub">{t('login.subtitle')}</p>
          <button type="button" className="login-submit" onClick={onLogin}>
            <img className="login-wecom" src={wecomMark} alt="" aria-hidden="true" />
            <span>{t('login.button')}</span>
            <Icon.ChevronRight size={16} />
          </button>

          <div className="login-divider">
            <span>{t('login.or')}</span>
          </div>

          <form
            className="login-form"
            onSubmit={(event) => {
              event.preventDefault();
              onLogin();
            }}
          >
            <input
              className="login-input"
              type="email"
              placeholder={t('login.emailPlaceholder')}
              aria-label={t('login.emailPlaceholder')}
              autoComplete="username"
            />
            <input
              className="login-input"
              type="password"
              placeholder={t('login.passwordPlaceholder')}
              aria-label={t('login.passwordPlaceholder')}
              autoComplete="current-password"
            />
            <button type="submit" className="login-email-submit">
              {t('login.emailButton')}
            </button>
          </form>

          <p className="login-hint">{t('login.hint')}</p>
        </div>

        <button
          type="button"
          className="login-feedback"
          onClick={() => setFeedbackOpen(true)}
        >
          <Icon.Message size={14} />
          {t('feedback.entry')}
        </button>
        {feedbackSent ? <span className="login-feedback-sent">{t('feedback.sent')}</span> : null}
      </section>

      {feedbackOpen ? (
        <Modal
          title={t('feedback.title')}
          subtitle={t('feedback.subtitle')}
          width={520}
          onClose={() => setFeedbackOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setFeedbackOpen(false)}>
                {t('btn.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-blue"
                disabled={!feedbackText.trim()}
                onClick={submitFeedback}
              >
                {t('feedback.submit')}
              </button>
            </>
          }
        >
          <textarea
            className="feedback-input"
            autoFocus
            maxLength={1000}
            value={feedbackText}
            placeholder={t('feedback.placeholder')}
            onChange={(event) => setFeedbackText(event.target.value)}
          />
          <div className="feedback-count">{feedbackText.length}/1000</div>
        </Modal>
      ) : null}
    </div>
  );
}
