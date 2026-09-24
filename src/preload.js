const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('autopost', {
  getState: () => ipcRenderer.invoke('state:get'),
  saveState: (state) => ipcRenderer.invoke('state:save', state)
  ,onRpaLog: (callback) => { const listener = (_, entry) => callback(entry); ipcRenderer.on('rpa:log', listener); return () => ipcRenderer.removeListener('rpa:log', listener); }
  ,onPublishConfirmation: (callback) => { const listener = (_, entry) => callback(entry); ipcRenderer.on('rpa:publish-confirmation', listener); return () => ipcRenderer.removeListener('rpa:publish-confirmation', listener); }
  ,confirmPublish: (batchId, actions) => ipcRenderer.invoke('publisher:confirm', { batchId, actions })
  ,getPublishers: () => ipcRenderer.invoke('publishers:list')
  ,preparePublish: (request) => ipcRenderer.invoke('publisher:prepare', request)
  ,publishJob: (jobId) => ipcRenderer.invoke('publisher:publish-job', jobId)
  ,chooseDirectory: () => ipcRenderer.invoke('dialog:choose-directory')
  ,setAccountCacheDir: (accountId, cacheDir) => ipcRenderer.invoke('account:set-cache-dir', { accountId, cacheDir })
  ,setCacheRoot: (cacheRoot) => ipcRenderer.invoke('settings:set-cache-root', cacheRoot)
  ,addAccount: (account) => ipcRenderer.invoke('account:add', account)
  ,updateAccount: (account) => ipcRenderer.invoke('account:update', account)
  ,openAccountCache: (accountId) => ipcRenderer.invoke('account:open-cache', accountId)
  ,deleteAccount: (accountId) => ipcRenderer.invoke('account:delete', accountId)
  ,deleteJob: (jobId) => ipcRenderer.invoke('job:delete', jobId)
  ,chooseFiles: (options) => ipcRenderer.invoke('dialog:choose-files', options)
  ,loginAccount: (accountId) => ipcRenderer.invoke('account:login', accountId)
  ,checkAccountLogin: (accountId) => ipcRenderer.invoke('account:check-login', accountId)
  ,rpaLoginAccount: (accountId) => ipcRenderer.invoke('account:rpa-login', accountId)
  ,getBrowserInfo: () => ipcRenderer.invoke('browser:info')
  ,getFingerprintProfiles: () => ipcRenderer.invoke('fingerprint:profiles')
});
