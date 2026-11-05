// water_surface.js - dept WATER: anime water surface for POND / BAMBOO / TOWN / GORGE / FALLS (y = 0).
// From above: refraction pre-pass (koi + bottom visible, tinted by real water depth from the refraction depth buffer),
// caustic net on the bottom, banded fresnel reflection (engine mirror texture when present, painted sky otherwise),
// painted ripple strokes, screen-space star glints on the sun path, ripple rings, contact foam, flow foam (rapids),
// boiling foam at a falls base, rain dimples. From below: bright silver underside, Snell's window with the world above,
// ripple net, rain rings seen from under. All drawn on threes (uT), hard edges, no blending.
import * as THREE from 'three';
import { OUT } from './fx_core.js';

export const MAX_RIP = 12;

const VS = /* glsl */ `
varying vec3 vW; varying float vDepth;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mv = viewMatrix * wp; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }
`;

const FS = (NOISE, MIRROR) => /* glsl */ `
${NOISE}
${OUT}
${MIRROR}
varying vec3 vW; varying float vDepth;
uniform float uT, uS, uY, uId, uDebug;
uniform vec2 uRes;
uniform sampler2D uRefr, uRefrD; uniform float uRefrOn, uNear, uFar;
uniform float uMirrorAmt;
uniform vec3 uDeep, uTint, uSkyHor, uSkyTop, uSunDir, uSunCol, uFoamCol, uFoamShade, uCaustCol, uUnderSilver, uUnderDeep, uWinCol, uStrokeCol, uFlashCol;
uniform float uWinCos; uniform mat4 uProj;
uniform float uMurk, uRefl, uCaust, uFoam, uShore, uRough, uRain, uGlint, uStrokes, uDistort, uFlash, uStrokeScale;
uniform vec2 uFlow;
uniform vec4 uRip[${MAX_RIP}];
uniform vec4 uFoamSeg[2]; uniform vec3 uFoamR[2];

float lin(float z){ float n = uNear, f = uFar; return (2.0 * n * f) / (f + n - (z * 2.0 - 1.0) * (f - n)); }

float H(vec2 p){ vec2 q = p - uFlow * uT; return (vnoise(q * 0.7) + 0.5 * vnoise(q * 1.9 + vec2(uT * 0.35, -uT * 0.2)) + 0.25 * vnoise(q * 4.3 - uT * 0.6)) * uRough; }

// caustic / ripple net: warped voronoi cell borders, thin bright lines (kept for the boiling foam shading)
float cnet(vec2 p, float t, float w){
  p += vec2(vnoise(p * 0.45 + t * 0.25), vnoise(p * 0.45 + 7.0 - t * 0.25)) * 1.3;
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
    vec2 o = vec2(float(x), float(y));
    vec2 h = vec2(hash12(i + o), hash12(i + o + 17.0));
    h = 0.5 + 0.42 * sin(t * 1.1 + 6.2831 * h);
    vec2 r = o + h - f; float d = dot(r, r);
    if(d < d1){ d2 = d1; d1 = d; } else if(d < d2) d2 = d;
  }
  float e = sqrt(d2) - sqrt(d1);
  float ww = min(w, fwidth(e) * 1.4 + 0.003);
  return 1.0 - smoothstep(ww, ww * 2.0, e);
}
// soft wavy caustic lines: iso-contours of two domain-warped noise fields (lace of soft wavy bright lines, no cells),
// drifting with the flow; lines stay ~2 px soft up close and thin out with distance
float cwave(vec2 p, float t, vec2 flow){
  p -= flow * t * 0.6;
  vec2 q = p + vec2(vnoise(p * 0.33 + vec2(t * 0.18, 0.0)), vnoise(p * 0.33 + vec2(5.2, -t * 0.18))) * 2.2;
  float n1 = vnoise(q * 0.85 + vec2(0.0, t * 0.22)), n2 = vnoise(q * 1.35 + vec2(t * 0.17, 3.7));
  float f1 = fract(n1 * 3.0), f2 = fract(n2 * 2.5 + 0.3);
  float w1 = fwidth(n1 * 3.0) * 1.2 + 0.035, w2 = fwidth(n2 * 2.5) * 1.2 + 0.035;
  float l1 = 1.0 - smoothstep(0.0, w1 * 1.6, abs(f1 - 0.5) - 0.0);
  float l2 = 1.0 - smoothstep(0.0, w2 * 1.6, abs(f2 - 0.5));
  float l = max(l1 * 0.85, l2 * 0.65) + l1 * l2 * 0.6;
  return clamp(l, 0.0, 1.0);
}
// drawn ripple bands for the underside: wavy stripes across the view, two tones
vec2 rbands(vec2 p, float t){
  vec2 q = p + vec2(vnoise(p * 0.25 + t * 0.15), vnoise(p * 0.25 + 9.0)) * 3.0;
  float b = sin(q.y * 1.7 + q.x * 0.35 + t * 0.9 + vnoise(q * 0.6) * 3.0);
  float fw = fwidth(b) + 0.02;
  return vec2(smoothstep(0.82 - fw, 0.82 + fw, b), smoothstep(-0.78 + fw, -0.78 - fw, b));
}
float star(vec2 q, float r){ q = abs(q); float a = q.x * 7.0 + q.y, b = q.x + q.y * 7.0; return max(step(a, r), step(b, r)) + step(length(q), r * 0.22); }

void main(){
  vec3 toC = cameraPosition - vW; float dist = length(toC); vec3 V = toC / dist;
  bool under = cameraPosition.y < uY;
  vec2 p = vW.xz;
  float lod = 1.0 / (1.0 + dist * 0.035);
  // drawn height field gradient + ripple rings
  float e = 0.12; float h0 = H(p);
  vec2 g = vec2(H(p + vec2(e, 0.0)) - h0, H(p + vec2(0.0, e)) - h0) / e;
  float ringLight = 0.0, ringDark = 0.0;
  for(int i = 0; i < ${MAX_RIP}; i++){
    vec4 R = uRip[i]; if(R.w <= 0.0) continue;
    float age = uT - R.z; if(age < 0.0) continue;
    vec2 d = p - R.xy; float r = length(d) + 1e-4;
    float sp = 0.42 * sqrt(R.w), life = 2.6 + R.w * 0.8;
    float fade = 1.0 - smoothstep(life * 0.35, life, age);
    float Rr = age * sp;
    float lw = (0.012 + 0.006 * R.w) * (1.0 + dist * 0.02);
    for(int k = 0; k < 3; k++){
      float rk = Rr * (1.0 - float(k) * 0.28) - float(k) * 0.02;
      if(rk <= 0.0) continue;
      float wob = (vnoise(normalize(d) * 3.0 + R.z * 10.0 + float(k)) - 0.5) * lw * 2.5;
      float l = 1.0 - smoothstep(lw, lw * 1.9, abs(r - rk + wob));
      float dl = 1.0 - smoothstep(lw * 0.9, lw * 1.7, abs(r - rk - lw * 2.6 + wob));
      float a = fade * (1.0 - float(k) * 0.25);
      ringLight = max(ringLight, l * a); ringDark = max(ringDark, dl * a * 0.6);
      g += d / r * sin((r - rk) * 18.0) * exp(-(r - rk) * (r - rk) * 30.0) * a * 0.25 * R.w;
    }
  }
  vec2 suv = gl_FragCoord.xy / uRes;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 col; float emis = 0.0;
  if(!under){
    // ---- refraction: what lies under the surface, tinted by the real water depth along the view ray
    vec2 ruv = suv + g * uDistort * lod;
    float zs = texture(uRefrD, ruv).r; float ds = lin(zs);
    if(ds < vDepth){ ruv = suv; zs = texture(uRefrD, suv).r; ds = lin(zs); }
    vec3 refr = texture(uRefr, ruv).rgb;
    vec3 Pb = cameraPosition - toC * (ds / max(vDepth, 1e-3));
    float wd = max(uY - Pb.y, 0.0);
    if(zs > 0.99999 || uRefrOn < 0.5){ wd = 60.0; refr = uDeep; }
    float a = 1.0 - exp(-wd * uMurk);
    float nb = (vnoise(p * 0.6 + 3.0) - 0.5) * 0.18;
    float aq = mix(a, clamp(floor((a + nb) * 3.0 + 0.35) / 3.0, 0.0, 1.0), 0.55);   // painted depth bands
    vec3 body = mix(refr * uTint, uDeep, clamp(aq, 0.0, 1.0));
    float patchy = smoothstep(0.4, 0.7, vnoise(Pb.xz * 0.45 + uT * 0.15));
    float ca = cwave(Pb.xz * 1.4, uT, uFlow * 1.4) * (1.0 - a) * uCaust * smoothstep(0.02, 0.15, wd) * (0.2 + 0.8 * patchy) * 0.55;
    body += uCaustCol * ca * (0.6 + 0.4 * lod);
    // ---- reflection: banded fresnel
    vec3 Rd = reflect(-V, N);
    vec3 refl = mix(uSkyHor, uSkyTop, smoothstep(-0.02, 0.45, Rd.y));
    float mRing = 0.0;
    if(uMirror.x > 0.5){ refl = mix(refl, mirrorSample(vW + vec3(g.x, 0.0, g.y) * uDistort * 6.0, 1.0), uMirrorAmt * clamp(uMirror.z * 1.6, 0.0, 1.0)); mRing = 0.0; emis = max(emis, mirrorEmis * 0.5); }
    float F = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
    F = 0.04 + 0.96 * F;
    F = mix(F, 0.1 + 0.8 * smoothstep(0.32, 0.36, F), 0.35);
    col = mix(body, refl, clamp(F * uRefl, 0.0, 1.0));
    // ---- painted strokes: long light dashes across the view, darker swells (scale shrinks with distance)
    vec3 cf = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);   // camera forward: strokes stay straight across the frame
    vec2 fw = normalize(cf.xz + vec2(1e-5, 0.0)), rt = vec2(fw.y, -fw.x);
    vec2 fl = uFlow * uT;
    vec2 q = vec2(dot(p - fl, rt), dot(p - fl, fw)) * uStrokeScale;
    float sfade = 1.0 - smoothstep(25.0 / uStrokeScale, 140.0 / uStrokeScale, dist);
    float s1 = vnoise(vec2(q.x * 0.45, q.y * 11.0) + vec2(0.0, uT * 0.5)) + 0.25 * vnoise(vec2(q.x * 2.6, q.y * 20.0) + 5.0);
    float dash = smoothstep(0.9, 0.915, s1);
    float s2 = vnoise(vec2(q.x * 0.35, q.y * 2.4) + 11.0 - vec2(0.0, uT * 0.3));
    float swell = smoothstep(0.66, 0.68, s2);
    float flowy = 1.0 - 0.9 * smoothstep(0.05, 0.3, length(uFlow));          // flowing water: strokes run along the current instead
    col = mix(col, col * vec3(0.8, 0.86, 0.92), swell * uStrokes * 0.55 * sfade * flowy);
    col = mix(col, mix(refl, uStrokeCol, 0.55), dash * uStrokes * (0.45 + 0.55 * F) * sfade * flowy);
    // ---- flowing streak strokes along the current (luminous light streaks + darker drag lines)
    float flowL = length(uFlow);
    if(flowL > 0.05){
      vec2 fd2 = uFlow / flowL, fp2 = vec2(fd2.y, -fd2.x);
      vec2 fq2 = vec2(dot(p, fp2) * 14.0, dot(p, fd2) * 0.3 - uT * flowL * 0.22 * 1.4);
      float sk = vnoise(fq2 + vec2(vnoise(vec2(dot(p, fd2) * 0.12, 0.0)) * 2.0, 0.0));
      float sk2 = vnoise(fq2 * vec2(0.6, 1.3) + 7.0);
      float sfd = (1.0 - smoothstep(20.0, 70.0, dist)) * smoothstep(0.05, 0.4, flowL);
      col = mix(col, mix(refl, uStrokeCol, 0.75), smoothstep(0.8, 0.82, sk) * 0.6 * sfd * uStrokes);
      col = mix(col, col * vec3(0.84, 0.9, 0.94), smoothstep(0.76, 0.78, sk2) * 0.45 * sfd * uStrokes);
    }
    // ---- rings
    col = mix(col, col * 0.78, ringDark * 0.8);
    col = mix(col, mix(refl, uStrokeCol, 0.7), max(ringLight, mRing * 0.8));
    // ---- rain dimples
    if(uRain > 0.0){
      vec2 rp = p * 2.2; vec2 ci = floor(rp); vec2 cf = fract(rp) - 0.5;
      float hh = hash12(ci);
      if(hash12(ci + 3.1) < uRain * 0.7){
        float ph = fract(uT * 1.6 + hh);
        float r = length(cf - (vec2(hash12(ci + 5.0), hash12(ci + 9.0)) - 0.5) * 0.2);
        float Rr = 0.03 + ph * 0.24, lw = min(0.02 + dist * 0.002, 0.05);
        float ring = (1.0 - smoothstep(lw, lw * 1.8, abs(r - Rr))) * (1.0 - ph) * (1.0 - smoothstep(0.34, 0.42, Rr + lw + 0.1));
        float dot0 = (1.0 - smoothstep(0.03, 0.05, r)) * step(ph, 0.25);
        col = mix(col, uStrokeCol, max(ring, dot0) * 0.75 * smoothstep(22.0, 4.0, dist));
      }
    }
    // ---- contact foam (shores, rocks) and flow foam (streams, rapids)
    // contact foam: two drawn lines at constant screen width from the waterline (pixels to contact = wd / fwidth(wd))
    float fwd = max(fwidth(wd), 1e-5);
    float pxd = wd / fwd / uS + (vnoise(p * 4.0 + uT * 0.7) - 0.5) * 3.0;
    float near0 = step(wd, 0.6);
    float shore = (1.0 - smoothstep(3.0, 4.0, pxd)) * near0;
    float shore2 = (1.0 - smoothstep(1.0, 1.8, abs(pxd - 8.5))) * near0 * step(0.004, fwd);
    float foam = max(shore, shore2 * 0.85) * uShore;
    float fshade = 0.0;
    if(uFoam > 0.0){
      vec2 fd = normalize(uFlow + vec2(1e-5, 0.0)), fp = vec2(fd.y, -fd.x);
      vec2 fq = vec2(dot(p, fp) * 1.1, dot(p - uFlow * uT, fd) * 0.32);
      float f1 = fbm2(fq * 0.9) + (1.0 - smoothstep(0.0, 0.7, wd)) * 0.18 * smoothstep(0.4, 0.7, uFoam);
      float thr = 0.8 - uFoam * 0.34;
      float fm = smoothstep(thr, thr + 0.012, f1);
      fshade = max(fshade, smoothstep(thr - 0.07, thr - 0.058, f1) - fm);
      foam = max(foam, fm);
      // streaky white tongues along the flow
      float st = vnoise(vec2(dot(p, fp) * 4.0, dot(p - uFlow * uT * 1.3, fd) * 0.3));
      foam = max(foam, smoothstep(0.86, 0.87, st) * smoothstep(0.2, 0.6, uFoam));
      fshade = max(fshade, smoothstep(0.8, 0.81, st) * (1.0 - smoothstep(0.2, 0.6, uFoam)) * step(0.01, uFoam) * 0.5);
    }
    for(int i = 0; i < 2; i++){
      vec3 FR = uFoamR[i]; if(FR.y <= 0.0) continue;
      // boiling foam around a falling-water foot (segment uFoamSeg.xy - .zw, radius FR.x, strength FR.y, outflow speed FR.z)
      vec2 a2 = uFoamSeg[i].xy, b2 = uFoamSeg[i].zw, ab = b2 - a2;
      float hseg = clamp(dot(p - a2, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
      vec2 dv = p - (a2 + ab * hseg); float dd = length(dv);
      vec2 out2 = dv / max(dd, 1e-4);
      float sc = 6.0 / FR.x;                                               // pattern scales with the foot size
      float k = 1.0 - smoothstep(0.0, FR.x, dd + (vnoise(p * sc * 0.4) - 0.5) * FR.x * 0.5);
      vec2 bp = (p - out2 * uT * FR.z) * sc * 0.5;
      float blob = fbm2(bp * 1.7 + uT * 0.4);
      float thr = 1.0 - k * 0.95;
      float fm = smoothstep(thr, thr + 0.02, blob + k * 0.25);
      // boiling rings: foam arcs pushed outward from the foot, broken by noise
      float rr = dd / FR.x * 5.0 - uT * FR.z / FR.x * 3.0 + vnoise(p * sc * 0.25) * 1.6;
      float ring = 1.0 - smoothstep(0.08, 0.16, abs(fract(rr) - 0.5));
      float kr = (1.0 - smoothstep(FR.x * 0.4, FR.x * 1.9, dd)) * step(0.45, vnoise(p * sc * 0.6 + uT * 0.3));
      foam = max(foam, max(fm, ring * kr) * FR.y);
      float ring2 = 1.0 - smoothstep(0.06, 0.12, abs(fract(rr + 0.32) - 0.5));
      fshade = max(fshade, ring2 * (1.0 - smoothstep(FR.x * 0.3, FR.x * 2.2, dd)) * FR.y * 0.7);
    }
    col = mix(col, uFoamShade, clamp(fshade, 0.0, 1.0) * 0.85);
    col = mix(col, uFoamCol, clamp(foam, 0.0, 1.0));
    // ---- glints: drawn stars on the sun path, screen space, redrawn on threes
    vec3 Rs = reflect(-V, normalize(vec3(-g.x * 2.2, 1.0, -g.y * 2.2)));
    float lobe = smoothstep(0.93, 0.985, dot(Rs, normalize(uSunDir)));
    if(lobe > 0.0 && uGlint > 0.0){
      vec2 sp = gl_FragCoord.xy / uS / 15.0; vec2 ci = floor(sp); vec2 cf = fract(sp) - 0.5;
      float hh = hash12(ci + floor(uT * 8.0 + 0.5) * 13.17);
      float on = step(1.0 - 0.22 * lobe, hh);
      float s = star(cf - (vec2(hash12(ci + 2.0), hash12(ci + 6.0)) - 0.5) * 0.4, 0.28 + 0.2 * hash12(ci + 4.0)) * on;
      col = mix(col, uSunCol * 1.6, clamp(s, 0.0, 1.0) * uGlint);
      emis = max(emis, s * uGlint * 1.5);
      col += uSunCol * lobe * 0.12 * uGlint;
    }
  } else {
    // ---- underside: silver total-reflection skin, Snell's window onto the world above (art-directed: smaller than
    // physical, soft edge + thin bright ring, the world above squeezed toward the rim with a band of shore silhouettes)
    float c = abs(V.y);
    float edge = uWinCos + (vnoise(p * 1.3 + uT) - 0.5) * 0.012;
    float win = smoothstep(edge - 0.02, edge + 0.012, c);
    vec4 cp = uProj * viewMatrix * vec4(cameraPosition + vec3(0.0, 100.0, 0.0), 1.0);
    vec2 C2 = cp.w > 0.0 ? cp.xy / cp.w * 0.5 + 0.5 : suv;
    vec2 wuv = C2 + (suv - C2) * 1.5 + g * uDistort * 2.0 * lod;
    bool inside = wuv.x > 0.0 && wuv.x < 1.0 && wuv.y > 0.0 && wuv.y < 1.0;
    vec3 above = texture(uRefr, clamp(wuv, 0.001, 0.999)).rgb;
    float zs = texture(uRefrD, clamp(wuv, 0.001, 0.999)).r;
    float r01 = clamp((c - edge) / max(1.0 - edge, 1e-3), 0.0, 1.0);    // 0 at the rim .. 1 straight up
    vec3 skyW = mix(uWinCol * 0.92, uWinCol * 1.12, r01);
    above = (!inside || zs > 0.99999 || uRefrOn < 0.5) ? skyW : mix(above * 1.1, uWinCol, 0.25);
    float az = atan(-toC.z, -toC.x);
    float sil = step(r01, 0.1 + 0.16 * vnoise(vec2(az * 4.0, 1.0)) + 0.08 * vnoise(vec2(az * 13.0, 5.0)));
    float sil2 = step(r01, 0.07 + 0.2 * pow(vnoise(vec2(az * 9.0, 2.0)), 2.0) + 0.05 * vnoise(vec2(az * 31.0, 7.0)));   // tree crowns + spikes
    above = mix(above, mix(uUnderDeep * 0.55, uWinCol, 0.12), max(sil * 0.0, sil2) * 0.9);
    vec3 silver = mix(uUnderDeep, uUnderSilver, smoothstep(0.05, edge, c));
    vec2 rb = rbands(p * 1.1, uT);
    silver = mix(silver, uUnderSilver * 1.15 + 0.05, rb.x * 0.55 * (0.4 + 0.6 * lod));
    silver = mix(silver, uUnderDeep, rb.y * 0.3 * (0.4 + 0.6 * lod));
    col = mix(silver, above, win);
    // foam ceiling: churned white foam on the underside around a falls foot (+ drifting patches in a foamy pool)
    float fc = 0.0;
    for(int i = 0; i < 2; i++){
      vec3 FR = uFoamR[i]; if(FR.y <= 0.0) continue;
      vec2 a2 = uFoamSeg[i].xy, b2 = uFoamSeg[i].zw, ab = b2 - a2;
      float hseg = clamp(dot(p - a2, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
      float dd = length(p - (a2 + ab * hseg));
      fc = max(fc, (1.0 - smoothstep(FR.x * 0.6, FR.x * 3.2, dd + (vnoise(p * 0.08) - 0.5) * FR.x)) * FR.y);
    }
    float fb = fbm2(p * 0.22 + vec2(uT * 0.25, -uT * 0.18)), fb2 = vnoise(p * 1.1 + uT * 0.6);
    float ceilF = smoothstep(0.62, 0.64, fb + fc * 0.45 + uFoam * 0.25 * smoothstep(0.5, 0.7, fb2));
    float ceilS = smoothstep(0.55, 0.57, fb + fc * 0.45 + uFoam * 0.2) - ceilF;
    col = mix(col, mix(uUnderSilver, vec3(0.75, 0.82, 0.95), 0.5), ceilS * 0.6);
    col = mix(col, vec3(0.93, 0.97, 1.0), ceilF * 0.92);
    emis = max(emis, ceilF * 0.15);
    float ring = 1.0 - smoothstep(0.0015, 0.005, abs(c - edge - 0.006));
    float halo = (1.0 - smoothstep(0.0, 0.05, edge - c)) * step(c, edge) * 0.25;
    col = mix(col, uUnderSilver * 1.25 + 0.1, halo);
    col = mix(col, vec3(1.0), ring * 0.9); emis = ring * 0.7;
    col = mix(col, uUnderSilver * 1.3, ringLight);
    if(uRain > 0.0){
      vec2 rp = p * 1.6; vec2 ci = floor(rp); vec2 cf = fract(rp) - 0.5;
      if(hash12(ci + 3.1) < uRain * 0.75){
        float ph = fract(uT * 1.6 + hash12(ci));
        float r = length(cf - (vec2(hash12(ci + 5.0), hash12(ci + 9.0)) - 0.5) * 0.2);
        float Rr = 0.03 + ph * 0.24, lw = min(0.02 + dist * 0.002, 0.05);
        float ring2 = (1.0 - smoothstep(lw, lw * 1.8, abs(r - Rr))) * (1.0 - ph) * (1.0 - smoothstep(6.0, 20.0, dist));
        float cdot = (1.0 - smoothstep(0.04, 0.06, r)) * step(ph, 0.2) * step(hash12(ci + 7.7), 0.4) * (1.0 - smoothstep(4.0, 14.0, dist));
        col = mix(col, uUnderDeep * 0.7, ring2 * 0.7);
        col = mix(col, vec3(1.0), cdot * 0.9); emis = max(emis, cdot * 0.6);
      }
    }
  }
  col = mix(col, col * 0.9 + uFlashCol * 0.2, uFlash * 0.5);
  vec3 nV = normalize((viewMatrix * vec4(N, 0.0)).xyz);
  if(uDebug > 0.5 && !under){
    float zs = texture(uRefrD, suv).r; float ds = lin(zs);
    vec3 Pb = cameraPosition - toC * (ds / max(vDepth, 1e-3)); float wd = max(uY - Pb.y, 0.0);
    col = uDebug < 1.5 ? vec3(fract(wd * 5.0), wd, step(0.99999, zs)) : texture(uRefr, suv).rgb;
  }
  writeOut(col, emis, nV, vDepth, uDebug > 0.5 ? 95.0 : uId);
}
`;

const C = (c) => new THREE.Color(c);

// presets per set: colours read as display hex (three converts to linear)
export const SURF = {
  POND: { deep: '#2f6f6a', tint: '#a8e0c8', skyHor: '#f6c9a0', skyTop: '#9fb8d8', murk: 0.9, refl: 0.95, caust: 0.55, rough: 0.12, strokes: 0.8,
    sun: '#fff1d0', glint: 1, foamCol: '#f4fbff', foamShade: '#9cc8d0', shore: 0.7, stroke: '#fff7ea', caustCol: '#fff3c8',
    underSilver: '#bfe8de', underDeep: '#3d8c80', win: '#ffe9c8' },
  BAMBOO: { deep: '#3f7a52', tint: '#c8ecc0', skyHor: '#a8d4b4', skyTop: '#88c0a0', murk: 1.4, refl: 0.6, caust: 0.8, rough: 0.2, strokes: 0.9,
    sun: '#fffbe0', glint: 1, foamCol: '#f8fff6', foamShade: '#a8d8c0', shore: 0.9, flow: [0, 0.7], foam: 0.12, stroke: '#ffffff', caustCol: '#fffbd8',
    underSilver: '#cdeccf', underDeep: '#4b8a60', win: '#f2ffe0' },
  TOWN: { deep: '#3a6e78', tint: '#c0dccc', skyHor: '#f6cf90', skyTop: '#c8b8c8', murk: 0.8, refl: 1.0, caust: 0.35, rough: 0.1, strokes: 0.85,
    sun: '#ffe2a0', glint: 1, foamCol: '#fff8ea', foamShade: '#b8c8c0', shore: 0.6, flow: [0, 0.25], stroke: '#fff1d0', caustCol: '#ffe8b0',
    underSilver: '#c8e0d0', underDeep: '#3d7070', win: '#ffe0a8' },
  GORGE: { deep: '#2a5470', tint: '#a8d0d8', skyHor: '#f8a070', skyTop: '#a070a8', murk: 0.7, refl: 0.9, caust: 0.4, rough: 0.35, strokes: 1.0, strokeScale: 0.6,
    sun: '#ffd0a0', glint: 1, foamCol: '#fff0ea', foamShade: '#a49cc8', shore: 1.0, flow: [0, 2.6], foam: 0.5, stroke: '#ffe6d6', caustCol: '#ffe0c8',
    underSilver: '#a8c8e0', underDeep: '#2a4f78', win: '#ffc8a8' },
  FALLS: { deep: '#18305a', tint: '#7fa8d0', skyHor: '#3c4a8c', skyTop: '#232a60', murk: 0.5, refl: 0.9, caust: 0.15, rough: 0.5, strokes: 1.0, strokeScale: 0.4,
    sun: '#c8f0ff', glint: 0.5, foamCol: '#e8f8ff', foamShade: '#6f9ccc', shore: 0.9, flow: [0, 1.5], foam: 0.35, stroke: '#bfe6ff', caustCol: '#c8f0ff',
    underSilver: '#6a8cc8', underDeep: '#1c2a5c', win: '#5a6cb0' },
};

export class Refraction {
  constructor() { this.rt = null; this.busy = false; this.surfaces = []; this.frame = -1; }
  ensure(w, h) {
    if (this.rt && this.rt.width === w && this.rt.height === h) return this.rt;
    this.rt?.dispose();
    const dt = new THREE.DepthTexture(w, h); dt.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthTexture: dt, depthBuffer: true });
    return this.rt;
  }
}

// makeSurface(A, refraction, preset, opts) -> { mesh, mat, U }
export function makeSurface(A, R, preset, opts = {}) {
  const P = { ...preset, ...opts };
  const U = {
    uT: { value: 0 }, uS: { value: 1 }, uDebug: { value: 0 }, uY: { value: opts.y ?? 0 }, uId: { value: opts.id ?? 120 }, uRes: { value: new THREE.Vector2(1920, 1040) },
    uRefr: { value: null }, uRefrD: { value: null }, uRefrOn: { value: 0 }, uNear: { value: 0.1 }, uFar: { value: 1000 },
    uMirrorAmt: { value: P.mirror ?? 1 },
    uDeep: { value: C(P.deep) }, uTint: { value: C(P.tint) }, uSkyHor: { value: C(P.skyHor) }, uSkyTop: { value: C(P.skyTop) },
    uSunDir: { value: (P.sunDir ? new THREE.Vector3(...P.sunDir) : A.AU.uSunDir.value.clone()).normalize() }, uSunCol: { value: C(P.sun) },
    uFoamCol: { value: C(P.foamCol) }, uFoamShade: { value: C(P.foamShade) }, uCaustCol: { value: C(P.caustCol) },
    uUnderSilver: { value: C(P.underSilver) }, uUnderDeep: { value: C(P.underDeep) }, uWinCol: { value: C(P.win) },
    uStrokeCol: { value: C(P.stroke) }, uFlashCol: { value: C('#cfe8ff') },
    uMurk: { value: P.murk }, uRefl: { value: P.refl }, uCaust: { value: P.caust }, uFoam: { value: P.foam ?? 0 }, uShore: { value: P.shore },
    uRough: { value: P.rough }, uRain: { value: 0 }, uGlint: { value: P.glint }, uStrokes: { value: P.strokes }, uDistort: { value: P.distort ?? 0.035 },
    uFlash: { value: 0 }, uWinCos: { value: P.winCos ?? 0.92 }, uProj: { value: new THREE.Matrix4() }, uStrokeScale: { value: P.strokeScale ?? 1 },
    uFlow: { value: new THREE.Vector2(...(P.flow ?? [0, 0])) },
    uRip: { value: Array.from({ length: MAX_RIP }, () => new THREE.Vector4()) },
    uFoamSeg: { value: [new THREE.Vector4(), new THREE.Vector4()] }, uFoamR: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  };
  const AUm = A.AU, mirU = A.GLSL.MIRROR ? { uReflect: AUm.uReflect, uReflectVP: AUm.uReflectVP, uMirror: AUm.uMirror, uMirror2: AUm.uMirror2, uRipple: AUm.uRipple, uRippleCol: AUm.uRippleCol } : {};
  const MIR = A.GLSL.MIRROR ?? 'uniform vec4 uMirror; float mirrorEmis = 0.0, mirrorRing = 0.0; vec3 mirrorSample(vec3 w, float d){ return vec3(0.0); }';
  if (!A.GLSL.MIRROR) mirU.uMirror = { value: new THREE.Vector4() };
  const mat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { ...U, ...mirU }, vertexShader: VS, fragmentShader: FS(A.GLSL.NOISE, MIR), side: THREE.DoubleSide });
  mat.name = 'water_surface';
  let geo;
  if (opts.geometry) geo = opts.geometry;
  else if (opts.radius) { geo = new THREE.CircleGeometry(opts.radius, 96); geo.rotateX(-Math.PI / 2); }
  else { const s = opts.size ?? [3000, 3000]; geo = new THREE.PlaneGeometry(s[0], s[1], 1, 1); geo.rotateX(-Math.PI / 2); }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water_surface';
  mesh.frustumCulled = false;
  if (opts.center) mesh.position.set(opts.center[0], 0, opts.center[1] ?? opts.center[2] ?? 0);
  mesh.position.y = opts.y ?? 0;
  mesh.renderOrder = 5;
  // refraction pre-pass: when the MAIN camera (layer 1 enabled) is about to draw this surface, render the scene without
  // water into a half-res colour+depth target (nested render, Reflector-style), then hand it to the shader.
  mesh.onBeforeRender = (renderer, scene, camera) => {
    U.uProj.value.copy(camera.projectionMatrix);
    if (R.busy || !camera.layers.isEnabled(1)) return;
    const cur = renderer.getRenderTarget();
    const W = cur ? cur.width : renderer.domElement.width, Hh = cur ? cur.height : renderer.domElement.height;
    U.uRes.value.set(W, Hh);
    const key = `${R.frame}|${camera.uuid}`;
    if (R.done !== key) {
      R.busy = true;
      // refraction camera = the main camera with a tight near plane (depth precision for the water-depth tint)
      const rc = (R.cam ??= new THREE.PerspectiveCamera());
      rc.copy(camera, false);
      rc.near = Math.max(0.02, Math.abs(camera.position.y - (opts.y ?? 0)) * 0.7);
      rc.near = Math.min(rc.near, 2.0); rc.far = Math.min(camera.far, 6000); rc.updateProjectionMatrix(); rc.updateMatrixWorld();
      R.near = rc.near; R.far = rc.far;
      const rt = R.ensure(Math.max(2, Math.round(W / 2)), Math.max(2, Math.round(Hh / 2)));
      // hide the water itself + dithered see-through layers above the water (vale mist planes, anything flagged
      // userData.noRefract): they belong to the main view only and would speckle the refraction / its depth
      const hide = R.surfaces.slice();
      scene.traverseVisible((o) => { if (o.userData.noRefract || (o.isMesh && o.material?.uniforms?.uDrift && o.material.depthWrite)) hide.push(o); });
      const vis = hide.map((m) => m.visible);
      hide.forEach((m) => { m.visible = false; });
      const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(true, true, false);
      renderer.render(scene, rc);
      renderer.setClearColor(cc, ca); renderer.setRenderTarget(cur);
      hide.forEach((m, i) => { m.visible = vis[i]; });
      R.busy = false; R.done = key;
    }
    U.uNear.value = R.near; U.uFar.value = R.far;
    U.uRefr.value = R.rt.texture; U.uRefrD.value = R.rt.depthTexture; U.uRefrOn.value = 1;
  };
  return { mesh, mat, U, P };
}
