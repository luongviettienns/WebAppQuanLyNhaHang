import { Platform } from 'react-native';

class NotificationHelper {
  private audioCtx: any = null;

  private getAudioContext(): any {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public async requestPermission(): Promise<boolean> {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    try {
      if (Notification.permission === 'granted') return true;
      if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      }
    } catch {
      // Ignored if browser blocks
    }
    return false;
  }

  public playChime(type: 'ready' | 'preparing' = 'ready'): void {
    if (Platform.OS !== 'web') return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';

      if (type === 'ready') {
        // Two-tone chime: D5 (587Hz) -> A5 (880Hz) - sound of restaurant ready bell
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880.0, now + 0.15);

        gain.gain.setValueAtTime(0.01, now);
        gain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.85);
      } else {
        // Soft chime for preparing: F5 (698Hz)
        osc.frequency.setValueAtTime(698.46, now);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.exponentialRampToValueAtTime(0.15, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.45);
      }
    } catch {
      // Audio playback restrictions fallback
    }
  }

  public vibrate(pattern: number[] = [200, 100, 200]): void {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Fallback
      }
    }
  }

  public sendSystemNotification(title: string, body: string): void {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    // Flash tab title
    try {
      const oldTitle = document.title;
      document.title = `🔔 ${title}`;
      setTimeout(() => {
        document.title = oldTitle;
      }, 8000);
    } catch {}

    // Show OS notification
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'crispy-bite-order'
        });
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      } catch {
        // Fallback
      }
    }
  }

  public notifyOrderPreparing(tableNumber: string | number): void {
    this.playChime('preparing');
    this.vibrate([150]);
    this.sendSystemNotification(
      'Bếp đang nấu món 🍳',
      `Đơn hàng Bàn ${tableNumber} đã bắt đầu được chế biến!`
    );
  }

  public notifyOrderReady(tableNumber: string | number): void {
    this.playChime('ready');
    this.vibrate([300, 150, 300, 150, 450]);
    this.sendSystemNotification(
      'Món ăn đã xong! 🎉',
      `Món ăn đã nấu xong! Nhân viên đang bưng ra Bàn ${tableNumber} cho bạn, chuẩn bị thưởng thức nhé!`
    );
  }

  public notifyOrderCompleted(tableNumber: string | number): void {
    this.vibrate([200]);
    this.sendSystemNotification(
      'Hoàn tất giao món ✨',
      `Chúc bạn ngon miệng tại Bàn ${tableNumber}!`
    );
  }
}

export const notificationHelper = new NotificationHelper();
