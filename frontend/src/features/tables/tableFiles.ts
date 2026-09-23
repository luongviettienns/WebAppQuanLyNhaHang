import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export function requireTableFileSupport() { if (Platform.OS === 'web' && typeof document === 'undefined') throw new Error('Trình duyệt không hỗ trợ thao tác file.'); }
export async function pickTableFile(): Promise<{ fileName: string; fileBase64: string } | null> {
  if (Platform.OS !== 'web') {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/comma-separated-values'], copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return null;
    const asset = result.assets[0]; if ((asset.size ?? 0) > 5 * 1024 * 1024) throw new Error('File tối đa 5 MB');
    return { fileName: asset.name, fileBase64: await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }) };
  }
  requireTableFileSupport();
  return new Promise((resolve, reject) => { const input = document.createElement('input'); input.type = 'file'; input.accept = '.xlsx,.csv'; input.oncancel = () => resolve(null); input.onchange = () => { const file = input.files?.[0]; if (!file) return resolve(null); if (file.size > 5 * 1024 * 1024) return reject(new Error('File tối đa 5 MB')); const reader = new FileReader(); reader.onerror = () => reject(new Error('Không thể đọc file đã chọn')); reader.onload = () => resolve({ fileName: file.name, fileBase64: String(reader.result).split(',')[1] }); reader.readAsDataURL(file); }; input.click(); });
}
async function shareBase64(fileBase64: string, fileName: string, mimeType?: string) { const directory = FileSystem.cacheDirectory || FileSystem.documentDirectory; if (!directory) throw new Error('Thiết bị không cung cấp thư mục lưu file'); const uri = directory + fileName.replace(/[^\p{L}\p{N}_.-]+/gu, '_'); await FileSystem.writeAsStringAsync(uri, fileBase64, { encoding: FileSystem.EncodingType.Base64 }); if (!await Sharing.isAvailableAsync()) throw new Error('Thiết bị không hỗ trợ chia sẻ file'); await Sharing.shareAsync(uri, mimeType ? { mimeType } : undefined); }
function blobBase64(blob: Blob) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Không thể đọc dữ liệu file')); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(blob); }); }
export async function saveTableFile(blob: Blob, fileName: string) { if (Platform.OS !== 'web') return shareBase64(await blobBase64(blob), fileName, blob.type); requireTableFileSupport(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export async function saveBase64File(fileBase64: string, fileName: string, mimeType?: string) { if (Platform.OS !== 'web') return shareBase64(fileBase64, fileName, mimeType); requireTableFileSupport(); const link = document.createElement('a'); link.href = `data:${mimeType || 'application/octet-stream'};base64,${fileBase64}`; link.download = fileName; document.body.appendChild(link); link.click(); link.remove(); }
export async function saveDataUrl(dataUrl: string, fileName: string) { if (Platform.OS !== 'web') return shareBase64(dataUrl.split(',')[1], fileName, dataUrl.slice(5, dataUrl.indexOf(';'))); requireTableFileSupport(); const link = document.createElement('a'); link.href = dataUrl; link.download = fileName; document.body.appendChild(link); link.click(); link.remove(); }
