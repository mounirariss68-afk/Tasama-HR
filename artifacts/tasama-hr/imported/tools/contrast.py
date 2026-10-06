import colorsys,sys
def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=sorted([lum(a),lum(b)],reverse=True); return (la+0.05)/(lb+0.05)
def shade(h,target_bg,ratio,darker=True):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    H,L,S=colorsys.rgb_to_hls(r,g,b)
    for i in range(200):
        r2,g2,b2=colorsys.hls_to_rgb(H,L,S); x='#%02X%02X%02X'%(round(r2*255),round(g2*255),round(b2*255))
        if cr(x,target_bg)>=ratio: return x
        L = L-0.005 if darker else L+0.005
    return x
if __name__=='__main__':
    print('white on 3FB0A8', round(cr('#FFFFFF','#3FB0A8'),2))
    p=shade('#3FB0A8','#FFFFFF',4.6); print('primary light',p, round(cr(p,'#FFFFFF'),2), 'on bg',round(cr(p,'#FBF8F4'),2))
    g=shade('#B68D2E','#FBF8F4',4.6); print('accent light',g, round(cr(g,'#FBF8F4'),2), 'white on',round(cr('#FFFFFF',g),2))
    print('muted 58595B on bg', round(cr('#58595B','#FBF8F4'),2), 'fg', round(cr('#303030','#FBF8F4'),2))
    d=shade('#3FB0A8','#0A1214',7,False); print('primary dark',d, round(cr(d,'#0A1214'),2), 'dark-on-it', round(cr('#0A1214',d),2))
    print('gold100 on dark', round(cr('#EED28A','#0A1214'),2), 'on hero', round(cr('#EED28A','#0B1A1E'),2))
    print('hero muted', round(cr('#A9BDBA','#0B1A1E'),2), 'hero fg', round(cr('#F5F1EA','#0B1A1E'),2))
    print('dark muted', round(cr('#A6B3B1','#0A1214'),2), 'on card', round(cr('#A6B3B1','#121E21'),2))
    s=shade('#2E8C85','#FFFFFF',4.6); print('secondary dark', s, round(cr('#FFFFFF',s),2))
    print('3FB0A8 on dark bg', round(cr('#3FB0A8','#0A1214'),2))
