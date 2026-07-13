// Google Drive Integration Logic
// Note: This requires a Client ID to be configured in Google Cloud Console with Drive API enabled.

const CLIENT_ID = '548556961562-qreid0isquid2u89f76m068v9mqp24h6.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

export async function uploadToDrive(dbFile: Blob, fileName: string) {
  if (!CLIENT_ID) {
    throw new Error('Google Client ID não configurado nas configurações.');
  }

  return new Promise((resolve, reject) => {
    // @ts-ignore
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (response: any) => {
        if (response.error) {
          return reject(response);
        }

        try {
          const accessToken = response.access_token;
          
          // 1. Create file metadata
          const metadata = {
            name: fileName,
            mimeType: 'application/x-sqlite3'
          };

          const form = new FormData();
          form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
          form.append('file', dbFile);

          const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            },
            body: form
          });

          if (uploadResponse.ok) {
            resolve(await uploadResponse.json());
          } else {
            reject(await uploadResponse.json());
          }
        } catch (e) {
          reject(e);
        }
      },
    });

    client.requestAccessToken();
  });
}

export async function listDriveBackups(): Promise<any[]> {
  if (!CLIENT_ID) {
    throw new Error('Google Client ID não configurado.');
  }

  return new Promise((resolve, reject) => {
    // @ts-ignore
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (response: any) => {
        if (response.error) return reject(response);
        try {
          const accessToken = response.access_token;
          const res = await fetch("https://www.googleapis.com/drive/v3/files?q=name contains 'backup-natum-' and trashed=false&orderBy=createdTime desc", {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          if (res.ok) {
            const data = await res.json();
            resolve(data.files);
          } else {
            reject(await res.json());
          }
        } catch (e) {
          reject(e);
        }
      },
    });
    client.requestAccessToken();
  });
}

export async function downloadFromDrive(fileId: string): Promise<Blob> {
  if (!CLIENT_ID) {
    throw new Error('Google Client ID não configurado.');
  }

  return new Promise((resolve, reject) => {
    // @ts-ignore
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (response: any) => {
        if (response.error) return reject(response);
        try {
          const accessToken = response.access_token;
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          if (res.ok) {
            resolve(await res.blob());
          } else {
            reject(await res.json());
          }
        } catch (e) {
          reject(e);
        }
      },
    });
    client.requestAccessToken();
  });
}

export function saveClientId(id: string) {
  localStorage.setItem('gdrive_client_id', id);
}

export function getClientId() {
  return localStorage.getItem('gdrive_client_id') || CLIENT_ID;
}
