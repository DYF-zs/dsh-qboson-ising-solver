"""Local Kaiwu authorization and license reuse."""
from __future__ import annotations

import base64
import json
import math
import struct
import threading
import time
import webbrowser
import zlib
from functools import lru_cache
from pathlib import Path
from queue import Empty, SimpleQueue


@lru_cache(maxsize=32)
def rounded_surface_png(width, height, radius, fill, outline, border):
    """Render rounded edges with pixel coverage, in physical display pixels."""
    fill_rgb = bytes.fromhex(fill.lstrip('#'))
    line_rgb = bytes.fromhex(outline.lstrip('#'))
    radius = min(radius, (width-2)/2, (height-2)/2)
    rows = bytearray()
    for y in range(height):
        rows.append(0)  # PNG scanline filter.
        for x in range(width):
            qx = abs(x + .5 - width/2) - (width/2 - 1 - radius)
            qy = abs(y + .5 - height/2) - (height/2 - 1 - radius)
            distance = math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - radius
            outer = max(0, min(1, .5-distance))
            inner = max(0, min(1, .5-distance-border))
            if outer:
                rows.extend(round((f*inner + o*(outer-inner))/outer) for f, o in zip(fill_rgb, line_rgb))
            else:
                rows.extend((0, 0, 0))
            rows.append(round(255*outer))
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind+data))
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('!2I5B', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(rows))) + chunk(b'IEND', b''))


def license_path(kw):
    for directory in kw.__path__:
        path = Path(directory) / 'license.lic'
        if path.is_file():
            return path
    return Path(next(iter(kw.__path__))) / 'license.lic'


def license_available(kw):
    """Check the stored file and validate authorization with the installed SDK."""
    try:
        token = license_path(kw).read_text(encoding='utf-8').split('_sdkCode_', 1)[0]
        payload = token.split('.')[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        if not isinstance(claims, dict):
            return False
        expires = claims.get('exp')
        if isinstance(expires, (int, float)) and expires <= time.time():
            return False
        kw.license.verify_license(0)
        return True
    except Exception:
        # An SDK rejection routes the caller to authorization; no SDK error
        # text or credential data is exposed to the dialog or model.
        return False


def authorize(kw, user_id, sdk_code):
    path = license_path(kw)
    backup = path.read_bytes() if path.exists() else None
    try:
        kw.license.init(user_id=user_id.strip(), sdk_code=sdk_code.strip())
        if not license_available(kw):
            raise ValueError('License 不可用，请检查授权信息后重试。')
    except Exception:
        if backup is not None:
            path.write_bytes(backup)
        elif path.exists():
            path.unlink()
        raise


def ensure_authorized(kw, force=False):
    if not force and license_available(kw):
        return True
    return show_authorization(kw)


def show_authorization(kw):
    import sys
    import tkinter as tk

    # The managed Python executable has no Windows DPI manifest of its own.
    # Enable system DPI awareness before Tk creates a native window.
    if sys.platform == 'win32':
        import ctypes
        ctypes.windll.user32.SetProcessDPIAware()
    root = tk.Tk()
    root.title('玻色量子 · 授权')
    root.configure(bg='#ffffff')
    root.resizable(False, False)
    is_mac = sys.platform == 'darwin'
    scale = 1 if is_mac else root.winfo_fpixels('1i') / 96
    font_family = 'PingFang SC' if is_mac else 'Microsoft YaHei UI'
    def font(size, *style):
        return (font_family, size + 3 if is_mac else size, *style)
    def px(value):
        return max(1, round(value * scale))
    branding = Path(__file__).resolve().parents[2] / 'assets' / 'branding'
    icon = tk.PhotoImage(file=str(branding / 'qboson-icon.png'))
    root.iconphoto(True, icon)
    if sys.platform == 'win32':
        root.iconbitmap(str(branding / 'qboson.ico'))
    root.attributes('-topmost', True)
    root.after(500, lambda: root.attributes('-topmost', False))
    root.option_add('*Font', font(10))
    done = {'success': False, 'busy': False}
    user, code, message = tk.StringVar(), tk.StringVar(), tk.StringVar()

    panel = tk.Frame(root, bg='#ffffff', padx=px(32), pady=px(30))
    panel.pack(fill='both', expand=True)
    original_logo = tk.PhotoImage(file=str(branding / 'qboson-logo.png'))
    logo = original_logo.zoom(max(1, round(scale * 4))).subsample(5)
    tk.Label(panel, image=logo, bg='white').pack(anchor='center', pady=(px(6), px(30)))

    def rounded_surface(parent, height, radius, fill, outline):
        canvas = tk.Canvas(parent, height=px(height), width=px(336), bg='white', highlightthickness=0, bd=0)
        def draw(_=None):
            canvas.delete('surface')
            w, h = canvas.winfo_width(), px(height)
            if w < 3:
                return
            data = rounded_surface_png(w, h, px(radius), canvas.surface_fill, canvas.surface_outline, scale)
            canvas.surface_image = tk.PhotoImage(data=base64.b64encode(data))
            canvas.create_image(0, 0, anchor='nw', image=canvas.surface_image, tags='surface')
            canvas.tag_lower('surface')
        canvas.surface_fill, canvas.surface_outline = fill, outline
        canvas.redraw = draw
        canvas.bind('<Configure>', draw)
        return canvas

    def field(label, variable, secret=False):
        tk.Label(panel, text=label, fg='#333333', bg='white', font=font(9)).pack(anchor='w', pady=(0, px(7)))
        box = rounded_surface(panel, 48, 12, '#fafafa', '#dfdfdf')
        box.pack(fill='x', pady=(0, px(17)))
        entry = tk.Entry(box, textvariable=variable, show='●' if secret else '', relief='flat', bd=0, bg='#fafafa', fg='#202020', insertbackground='#202020', highlightthickness=0)
        item = box.create_window(px(15), px(24), window=entry, anchor='w')
        def resize(event):
            box.itemconfigure(item, width=max(px(40), event.width-px(75 if secret else 30)))
        box.bind('<Configure>', resize, add='+')
        def focus(color):
            box.surface_outline = color
            box.redraw()
        entry.bind('<FocusIn>', lambda _: focus('#8a8a8a'))
        entry.bind('<FocusOut>', lambda _: focus('#dfdfdf'))
        if secret:
            eye_size = min((28, 35, 42, 49, 56, 70, 84), key=lambda size: abs(size-px(28)))
            eyes = {state: tk.PhotoImage(file=str(branding / f'eye-{state}-{eye_size}.png')) for state in ('hidden', 'visible')}
            toggle = tk.Canvas(box, name='visibility_toggle', width=eye_size, height=eye_size, bg='#fafafa', highlightthickness=0, cursor='hand2', takefocus=True)
            toggle.images = eyes
            toggle_item = box.create_window(px(302), px(24), window=toggle)
            box.bind('<Configure>', lambda e: box.coords(toggle_item, e.width-px(30), px(24)), add='+')
            def draw_eye(focused=False):
                toggle.delete('all')
                state = 'hidden' if entry.cget('show') else 'visible'
                toggle.create_image(eye_size/2, eye_size/2, image=eyes[state])
                if focused:
                    toggle.create_rectangle(1, 1, eye_size-2, eye_size-2, outline='#b0b0b0')
            def reveal(_=None):
                hidden = bool(entry.cget('show'))
                entry.configure(show='' if hidden else '●')
                draw_eye()
                return 'break'
            draw_eye()
            toggle.bind('<Button-1>', reveal)
            toggle.bind('<space>', reveal)
            toggle.bind('<Return>', reveal)
            toggle.bind('<FocusIn>', lambda _: draw_eye(True))
            toggle.bind('<FocusOut>', lambda _: draw_eye())
        return entry

    first = field('用户 ID', user)
    secret = field('SDK Code', code, True)
    tk.Label(panel, textvariable=message, fg='#b43636', bg='white', anchor='w', justify='left', wraplength=px(330), font=font(9)).pack(fill='x', pady=(0, px(3)))

    def close():
        if not done['busy']:
            root.destroy()

    def complete(error):
        done['busy'] = False
        button.configure(state='normal', text='授权')
        if error:
            message.set('授权失败，请检查用户 ID 和 SDK Code 后重试。')
            return
        done['success'] = True
        done['busy'] = True
        code.set('')
        for widget in panel.winfo_children():
            widget.destroy()
        success = tk.Frame(panel, bg='white')
        success.pack(expand=True)
        tk.Label(success, text='✓', fg='#238250', bg='white', font=(font_family if is_mac else 'Segoe UI', 32)).pack(pady=(0, px(12)))
        tk.Label(success, text='授权成功', fg='#202020', bg='white', font=font(16, 'bold')).pack()
        root.after(1000, root.destroy)

    completion = SimpleQueue()
    def poll_authorization():
        try:
            error = completion.get_nowait()
        except Empty:
            root.after(50, poll_authorization)
        else:
            complete(error)

    def submit():
        if done['busy']:
            return
        uid, token = user.get().strip(), code.get().strip()
        if not uid or not token:
            message.set('请填写用户 ID 和 SDK Code。')
            return
        message.set('正在完成授权，请稍候…')
        done['busy'] = True
        button.configure(state='disabled', text='正在授权…')
        def run():
            try:
                authorize(kw, uid, token)
                error = False
            except Exception:
                error = True
            completion.put(error)
        threading.Thread(target=run, daemon=True).start()
        root.after(50, poll_authorization)

    action = rounded_surface(panel, 46, 23, '#202020', '#202020')
    action.pack(fill='x', pady=(px(4), px(18)))
    button_options = dict(text='授权', bg='#202020', fg='white', activebackground='#202020', activeforeground='white', relief='flat', bd=0, highlightthickness=0, cursor='hand2', font=font(10, 'bold'))
    if is_mac:
        # A label keeps the capsule colors consistent with the Cocoa canvas.
        button = tk.Label(action, **button_options, takefocus=True)
        button.bind('<ButtonRelease-1>', lambda _: submit())
        button.bind('<space>', lambda _: submit())
    else:
        button = tk.Button(action, **button_options, command=submit)
    button_item = action.create_window(px(168), px(23), window=button, width=px(276), height=px(32))
    action.bind('<Configure>', lambda e: (action.coords(button_item, e.width/2, px(23)), action.itemconfigure(button_item, width=e.width-px(60))), add='+')
    action.bind('<Button-1>', lambda _: submit())
    link = tk.Label(panel, text='获取 SDK 凭证 ↗', fg='#555555', bg='white', cursor='hand2', font=font(9, 'underline'), takefocus=True)
    link.pack(anchor='e')
    link.bind('<Button-1>', lambda _: webbrowser.open('https://platform.qboson.com/sdkDownload'))
    link.bind('<Return>', lambda _: (webbrowser.open('https://platform.qboson.com/sdkDownload'), 'break')[-1])
    link.bind('<Enter>', lambda _: link.configure(fg='#111111'))
    link.bind('<Leave>', lambda _: link.configure(fg='#555555'))
    root.protocol('WM_DELETE_WINDOW', close)
    if is_mac:
        root.createcommand('::tk::mac::Quit', close)
    root.bind('<Return>', lambda _: submit())
    first.focus_set()
    root.update_idletasks()
    width = max(px(400), root.winfo_reqwidth())
    height = root.winfo_reqheight()
    root.geometry(f'{width}x{height}+{max(0, (root.winfo_screenwidth()-width)//2)}+{max(0, (root.winfo_screenheight()-height)//2)}')
    if sys.platform == 'win32':
        # Windows 11 supports rounded top-level window corners.
        corner = ctypes.c_int(2)
        parent = ctypes.windll.user32.GetParent
        parent.argtypes, parent.restype = [ctypes.c_void_p], ctypes.c_void_p
        set_attribute = ctypes.windll.dwmapi.DwmSetWindowAttribute
        set_attribute.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_void_p, ctypes.c_uint]
        set_attribute.restype = ctypes.c_long
        set_attribute(
            parent(root.winfo_id()), 33,
            ctypes.byref(corner), ctypes.sizeof(corner),
        )
    root.mainloop()
    return done['success']
