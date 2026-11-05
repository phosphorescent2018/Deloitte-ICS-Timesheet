import React from 'react';
import { createRoot } from 'react-dom/client';
import TimesheetApp from './prototypes/timesheet';
import { I18nProvider } from './prototypes/timesheet/i18n';

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root container is missing');
}

createRoot(container).render(
  <React.StrictMode>
    <I18nProvider>
      <TimesheetApp />
    </I18nProvider>
  </React.StrictMode>,
);
