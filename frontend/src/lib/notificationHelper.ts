class NotificationHelper {
  private audioCtx: any = null;

  public resetForTesting(): void {
    this.audioCtx = null;
  }

  private getAudioContext(): any {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!this.audioCtx && AudioContextClass) {
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public getPermissionStatus(): 'granted' | 'denied' | 'default' | 'unsupported' {
    if (typeof window === 'undefined' || !(window as any).Notification) {
      return 'unsupported';
    }
    return (window as any).Notification.permission || 'default';
  }

  public async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !(window as any).Notification) {
      return false;
    }
    try {
      const Notif = (window as any).Notification;
      if (Notif.permission === 'granted') return true;
      if (Notif.permission !== 'denied') {
        const permission = await Notif.requestPermission();
        return permission === 'granted';
      }
    } catch {
      // Ignored if browser blocks
    }
    return false;
  }

  public playChime(type: 'ready' | 'preparing' = 'ready'): void {
    if (typeof window === 'undefined') return;
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
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Fallback
      }
    }
  }

  public sendSystemNotification(title: string, body: string): void {
    if (typeof window === 'undefined') return;

    // Flash tab title
    try {
      if (typeof document !== 'undefined') {
        const oldTitle = document.title;
        document.title = `🔔 ${title}`;
        setTimeout(() => {
          document.title = oldTitle;
        }, 8000);
      }
    } catch {}

    // Show OS notification
    const Notif = (window as any).Notification;
    if (Notif && Notif.permission === 'granted') {
      const options = {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'crispy-bite-order',
        renotify: true,
        vibrate: [600, 200, 600, 200, 1000]
      };

      // Service worker showNotification for mobile Android Chrome
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && (navigator as any).serviceWorker.ready) {
        (navigator as any).serviceWorker.ready
          .then((reg: any) => {
            if (reg && reg.showNotification) {
              return reg.showNotification(title, options);
            }
          })
          .catch(() => {});
      }

      try {
        const notif = new Notif(title, options);
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
    this.vibrate([350]);
    this.sendSystemNotification(
      'Bếp đang nấu món 🍳',
      `Đơn hàng Bàn ${tableNumber} đã bắt đầu được chế biến!`
    );
  }

  public notifyOrderReady(tableNumber: string | number): void {
    this.playChime('ready');
    this.vibrate([600, 200, 600, 200, 1000]);
    this.sendSystemNotification(
      'Món ăn đã xong! 🎉',
      `Món ăn đã nấu xong! Nhân viên đang bưng ra Bàn ${tableNumber} cho bạn, chuẩn bị thưởng thức nhé!`
    );
  }

  public notifyOrderCompleted(tableNumber: string | number): void {
    this.vibrate([300, 150, 300]);
    this.sendSystemNotification(
      'Hoàn tất giao món ✨',
      `Chúc bạn ngon miệng tại Bàn ${tableNumber}!`
    );
  }
}

export const notificationHelper = new NotificationHelper();
