import { Platform } from 'react-native';

export function requireSupplierFileSupport() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') throw new Error('Nhập và tải file hiện hỗ trợ trên giao diện Web.');
}
export async function pickSupplierFile(): Promise<{ fileName: string; fileBase64: string } | null> {
  requireSupplierFileSupport();
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.xlsx,.csv';
    input.oncancel = () => resolve(null);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > 5 * 1024 * 1024) return reject(new Error('File tối đa 5 MB'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Không thể đọc file đã chọn'));
      reader.onload = () => resolve({ fileName: file.name, fileBase64: String(reader.result).split(',')[1] });
      reader.readAsDataURL(file);
    };
    input.click();
  });
}
export function saveSupplierFile(blob: Blob, fileName: string) {
  requireSupplierFileSupport();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
