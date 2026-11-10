import { useI18n } from './i18n';
import mindigitalMark from './assets/mindigital-mark.svg';
import wecomMark from './assets/wecom.png';
import { Icon } from './ui';

interface Props {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: Props) {
  const { t, lang, setLang } = useI18n();

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
      </section>
    </div>
  );
}
