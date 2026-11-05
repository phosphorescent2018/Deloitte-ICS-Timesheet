import React from 'react';
import { createRoot } from 'react-dom/client';
import TimesheetApp from './prototypes/timesheet';

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root container is missing');
}

createRoot(container).render(
  <React.StrictMode>
    <TimesheetApp />
  </React.StrictMode>,
);
