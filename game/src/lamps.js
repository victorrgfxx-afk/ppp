import * as THREE from 'three';

// The street lamps' light (V101). Until now a lamp head glowed but lit nothing: no pool of light on the road under
// it, on the snow, the fences, the walls and the parked cars, while the snow falling round it was lit (rain.js) and
// its image was mirrored in the wet road (post.js). Now the nearest lamps light everything the sun lights, in the
// same light loop (every lit material: the road and the ground, the snow, the houses, the cars, the trees, the hand
// and the gun you hold), with the same physically based shading (a gleam on a wet road, a glint on fresh snow).
//
// A lamp head looks down. Its light is spread like a road luminaire's ("batwing", strongest some 60-70 deg from
// straight down, so the road between two poles is lit too, and cut off near the horizontal - EN 13201 road lighting
// classes put ~5-15 lx on a residential street): I(g) = I0 (0.55 + 0.9 sin^2 g) for g the angle from straight down,
// gone by ~84 deg. Its light falls off as 1/d^2 and lights what faces it (cos of the incidence).
//
// Shadows: what stands between a lamp and a point (a house, a car, a wall, a crown in leaf) is read from the height
// map of the tops of things the rain already keeps round you (rain.js RainOcclusion, ±48 m, ~19 cm a texel): five
// points along the way to the lamp, each blocked where something there stands higher than the ray. Kept up to date at
// night too (main.js). Materials without that map (the lying snow's blanket, the gun) take the light unshadowed.
//
// Units: the scene's (main.js): at night 1 unit of light is ~0.5 lx (the moon's 0.48 ~0.25 lx). The lamps here give
// ~3 units right under the head (6 times the full moon; a real street lamp's 5-15 lx is 20-60 times it: the night's
// exposure is set for the moonlight and the torch, and the eye under a lamp adapts to it), ~0.9 between two poles.

export const LAMP_N = 8;
// world position (xyz) and strength (w, 0 = off) of each lamp, nearest first: one array shared by every material
// (three.js copies a uniform's typed array by reference); colour (rgb) and on (w)
export const LAMP = { w: new Float32Array(LAMP_N * 4), c: { x: 1, y: 0.78, z: 0.5, w: 0 } };
export const LAMP_I0 = 280;                 // (units m^2: E = I / d^2)

const PARS = /* glsl */`
uniform vec4 lampW[ ${LAMP_N} ];
uniform vec4 lampC;
// a road luminaire's spread: cg = cos of the angle from straight down (1 below the head, 0 level with it)
float lampSpread( float cg ) {
	return ( 0.55 + 0.9 * ( 1.0 - cg * cg ) ) * smoothstep( 0.1, 0.34, cg );
}
`;

// (after the sun's, before the sky's light: lights_fragment_end)
const LOOP = /* glsl */`
#if defined( RE_Direct )
if ( lampC.w > 0.0 ) {
	vec3 lampP = transpose( mat3( viewMatrix ) ) * ( geometryPosition - viewMatrix[ 3 ].xyz );   // (this point, world)
	for ( int i = 0; i < ${LAMP_N}; i ++ ) {
		vec4 lw = lampW[ i ];
		if ( lw.w <= 0.0 ) break;                             // (nearest first, the rest off)
		vec3 ld = lw.xyz - lampP;
		float d2 = dot( ld, ld );
		if ( d2 > 1225.0 ) continue;                          // (35 m: below the moon's light there)
		float dl = sqrt( d2 );
		vec3 l = ld / dl;
		float spread = lampSpread( l.y );
		if ( spread <= 0.0 ) continue;
		float lsh = 1.0;
#ifdef LAMP_OCC
		lsh = lampShadow( lampP, lw.xyz );
		if ( lsh <= 0.0 ) continue;
#endif
		directLight.direction = normalize( mat3( viewMatrix ) * l );
		directLight.color = lampC.rgb * ( lw.w * spread * lsh / max( d2, 0.3 ) ) * ( 1.0 - smoothstep( 900.0, 1225.0, d2 ) );
		directLight.visible = true;
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#ifdef LAMP_GLINT
		// fresh snow's crystals sparkle under a lamp as they do in the sun (rain.js: snowGlint, per material)
		LAMP_GLINT( directLight.color, directLight.direction )
#endif
	}
}
#endif
`;

// the lamp's shadow from the height map (rain.js OCC_GLSL: rainTop): what stands taller than the ray towards the lamp
export const LAMP_OCC_GLSL = /* glsl */`
float lampShadow( vec3 p, vec3 lp ) {
	if ( uOccOn < 0.5 ) return 1.0;
	vec3 e = lp - p;
	float s = 1.0;
	for ( int k = 1; k <= 5; k ++ ) {
		vec3 q = p + e * ( float( k ) * 0.15 );
		s = min( s, 1.0 - smoothstep( 0.12, 0.55, rainTop( q.xz ) - q.y ) );
	}
	return s;
}
`;

// (the same spread on the CPU: the lamps' glare in the eye, main.js)
export const lampSpread = (cg) => (0.55 + 0.9 * (1 - cg * cg)) * (cg <= 0.1 ? 0 : cg >= 0.34 ? 1 : ((t) => t * t * (3 - 2 * t))((cg - 0.1) / 0.24));

// Must run before the first material is compiled (after lighting.js installCascadedShadows).
export function installLampLight() {
	THREE.ShaderChunk.lights_pars_begin += PARS;
	THREE.ShaderChunk.lights_fragment_end = LOOP + THREE.ShaderChunk.lights_fragment_end;
	for (const k in THREE.ShaderLib) {
		const u = THREE.ShaderLib[k].uniforms;
		if (u.directionalLights) { u.lampW = { value: LAMP.w }; u.lampC = { value: LAMP.c }; }
	}
}

// Picks the lamps nearest the camera each frame (they are few: a list scan); level: how bright they burn (0-1, the
// dusk switches them on), colour: of their light.
export class LampLight {
	constructor(lamps) {
		this.lamps = lamps;
		this.near = [];
		this.level = 0;
		this.list = [];                      // (the ones lit now, nearest first: eye.js reads them for their glare)
	}
	update(cam, level) {
		this.level = level;
		const w = LAMP.w;
		LAMP.c.w = level > 0.01 ? 1 : 0;
		this.list.length = 0;
		if (!LAMP.c.w) { w.fill(0); return; }
		const near = this.near;
		near.length = 0;
		for (const l of this.lamps) {
			if (l.commune && this.cut) continue;                    // (V120: the commune's lamps with its power cut: releu.js)
			const d = (l.x - cam.x) ** 2 + (l.z - cam.z) ** 2;
			if (d < 70 * 70) near.push([d, l]);
		}
		near.sort((a, b) => a[0] - b[0]);
		for (let i = 0; i < LAMP_N; i++) {
			const l = near[i]?.[1];
			if (l) { w[i * 4] = l.x; w[i * 4 + 1] = l.y; w[i * 4 + 2] = l.z; w[i * 4 + 3] = LAMP_I0 * level; this.list.push(l); }
			else { w[i * 4 + 3] = 0; }
		}
	}
}
