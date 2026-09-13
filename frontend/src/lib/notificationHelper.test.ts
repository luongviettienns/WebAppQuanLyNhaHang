import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notificationHelper } from './notificationHelper';

describe('NotificationHelper', () => {
  let mockOscillator: any;
  let mockGain: any;
  let mockAudioContext: any;
  let mockVibrate: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockOscillator = {
      type: 'sine',
      frequency: {
        setValueAtTime: vi.fn()
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    };

    mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn()
      },
      connect: vi.fn()
    };

    mockAudioContext = {
      state: 'running',
      currentTime: 10,
      destination: {},
      createOscillator: vi.fn(() => mockOscillator),
      createGain: vi.fn(() => mockGain),
      resume: vi.fn().mockResolvedValue(undefined)
    };

    mockVibrate = vi.fn();
    try {
      Object.defineProperty(globalThis.navigator, 'vibrate', {
        value: mockVibrate,
        writable: true,
        configurable: true
      });
    } catch {
      (globalThis as any).navigator = { vibrate: mockVibrate };
    }

    vi.stubGlobal('window', {
      AudioContext: vi.fn(() => mockAudioContext)
    });

    vi.stubGlobal('document', {
      title: 'Crispy Bite'
    });

    notificationHelper.resetForTesting();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('requestPermission', () => {
    it('returns false if Notification is not in window', async () => {
      const result = await notificationHelper.requestPermission();
      expect(result).toBe(false);
    });

    it('returns true if permission is already granted', async () => {
      vi.stubGlobal('window', {
        Notification: {
          permission: 'granted',
          requestPermission: vi.fn()
        }
      });
      const result = await notificationHelper.requestPermission();
      expect(result).toBe(true);
    });

    it('requests permission and returns true when granted by user', async () => {
      vi.stubGlobal('window', {
        Notification: {
          permission: 'default',
          requestPermission: vi.fn().mockResolvedValue('granted')
        }
      });
      const result = await notificationHelper.requestPermission();
      expect(result).toBe(true);
    });

    it('returns false when permission is denied by user', async () => {
      vi.stubGlobal('window', {
        Notification: {
          permission: 'default',
          requestPermission: vi.fn().mockResolvedValue('denied')
        }
      });
      const result = await notificationHelper.requestPermission();
      expect(result).toBe(false);
    });
  });

  describe('vibrate', () => {
    it('calls navigator.vibrate with the provided pattern', () => {
      notificationHelper.vibrate([200, 100, 200]);
      expect(mockVibrate).toHaveBeenCalledWith([200, 100, 200]);
    });

    it('does not crash if navigator.vibrate throws an error', () => {
      mockVibrate.mockImplementation(() => {
        throw new Error('Vibration disabled');
      });
      expect(() => notificationHelper.vibrate([100])).not.toThrow();
    });
  });

  describe('playChime', () => {
    it('creates oscillator and plays ready chime frequencies (587Hz and 880Hz)', () => {
      notificationHelper.playChime('ready');
      expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(587.33, 10);
      expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(880.0, 10.15);
      expect(mockOscillator.start).toHaveBeenCalledWith(10);
      expect(mockOscillator.stop).toHaveBeenCalledWith(10.85);
    });

    it('plays preparing chime frequency (698Hz)', () => {
      notificationHelper.playChime('preparing');
      expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(698.46, 10);
      expect(mockOscillator.start).toHaveBeenCalledWith(10);
      expect(mockOscillator.stop).toHaveBeenCalledWith(10.45);
    });

    it('resumes suspended AudioContext before playing', () => {
      mockAudioContext.state = 'suspended';
      notificationHelper.playChime('ready');
      expect(mockAudioContext.resume).toHaveBeenCalled();
    });
  });

  describe('sendSystemNotification', () => {
    it('updates document.title with bell icon notification', () => {
      notificationHelper.sendSystemNotification('Món ăn đã xong', 'Bàn 05');
      expect(document.title).toBe('🔔 Món ăn đã xong');
    });

    it('creates Notification instance when permission is granted', () => {
      const MockNotification = vi.fn();
      (MockNotification as any).permission = 'granted';

      vi.stubGlobal('window', {
        Notification: MockNotification
      });

      notificationHelper.sendSystemNotification('Món ăn đã xong', 'Bàn 05');
      expect(MockNotification).toHaveBeenCalledWith('Món ăn đã xong', expect.objectContaining({
        body: 'Bàn 05',
        tag: 'crispy-bite-order'
      }));
    });
  });

  describe('high-level order notifications', () => {
    it('notifyOrderPreparing triggers preparing chime, vibration, and system notification', () => {
      const chimeSpy = vi.spyOn(notificationHelper, 'playChime');
      const vibrateSpy = vi.spyOn(notificationHelper, 'vibrate');
      const notifSpy = vi.spyOn(notificationHelper, 'sendSystemNotification');

      notificationHelper.notifyOrderPreparing('05');

      expect(chimeSpy).toHaveBeenCalledWith('preparing');
      expect(vibrateSpy).toHaveBeenCalledWith([150]);
      expect(notifSpy).toHaveBeenCalledWith('Bếp đang nấu món 🍳', expect.stringContaining('Bàn 05'));
    });

    it('notifyOrderReady triggers ready chime, extended vibration, and system notification', () => {
      const chimeSpy = vi.spyOn(notificationHelper, 'playChime');
      const vibrateSpy = vi.spyOn(notificationHelper, 'vibrate');
      const notifSpy = vi.spyOn(notificationHelper, 'sendSystemNotification');

      notificationHelper.notifyOrderReady('05');

      expect(chimeSpy).toHaveBeenCalledWith('ready');
      expect(vibrateSpy).toHaveBeenCalledWith([300, 150, 300, 150, 450]);
      expect(notifSpy).toHaveBeenCalledWith('Món ăn đã xong! 🎉', expect.stringContaining('Bàn 05'));
    });

    it('notifyOrderCompleted triggers vibration and completion notification', () => {
      const vibrateSpy = vi.spyOn(notificationHelper, 'vibrate');
      const notifSpy = vi.spyOn(notificationHelper, 'sendSystemNotification');

      notificationHelper.notifyOrderCompleted('05');

      expect(vibrateSpy).toHaveBeenCalledWith([200]);
      expect(notifSpy).toHaveBeenCalledWith('Hoàn tất giao món ✨', expect.stringContaining('Bàn 05'));
    });
  });
});
