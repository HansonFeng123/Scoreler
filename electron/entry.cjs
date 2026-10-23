// Keep Electron's initial entry synchronous. The application module may await
// a runtime handoff during source updates; it must not block browser startup.
const {app,dialog}=require('electron');
import('./main.js').catch(()=>{
 dialog.showErrorBox('Scoreler','Scoreler could not start. Your study profile is unchanged. Please reinstall the latest Scoreler package.');
 app.exit(1);
});
