import React, { useCallback, useRef } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { GLView } from "expo-gl";
import * as THREE from "three";

const COLORS = [
  "#FF6B6B", "#FF8E53", "#FFC107", "#56CCF2",
  "#00C2CB", "#6C63FF", "#AF52DE", "#34C759",
];

function nameColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}

type Props = {
  uri?: string | null;
  name: string;
  size?: number;
  premium?: boolean;
};

export function ThreeDAvatar({ uri, name, size = 48, premium = false }: Props) {
  const color = nameColor(name || "U");
  const rafRef = useRef<number>(0);

  const onContextCreate = useCallback((gl: any) => {
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;

    const renderer = new THREE.WebGLRenderer({
      canvas: {
        width: w,
        height: h,
        style: {},
        addEventListener: () => {},
        removeEventListener: () => {},
        clientHeight: h,
        clientWidth: w,
      } as any,
      context: gl,
      alpha: true,
      antialias: true,
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
    camera.position.set(0, 0, 3.2);

    const geometry = new THREE.SphereGeometry(1, 64, 64);
    const rgb = hexToRgb(color);
    const material = new THREE.MeshPhongMaterial({
      color: new THREE.Color(rgb.r * 0.15, rgb.g * 0.15, rgb.b * 0.15),
      specular: new THREE.Color(1, 1, 1),
      shininess: 180,
      transparent: true,
      opacity: uri ? 0.55 : 0.0,
    });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(3, 4, 4);
    scene.add(keyLight);

    const rgb2 = hexToRgb("#00C2CB");
    const rimLight = new THREE.DirectionalLight(
      new THREE.Color(rgb2.r, rgb2.g, rgb2.b),
      premium ? 0.7 : 0.3
    );
    rimLight.position.set(-3, -2, -2);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.2);
    fillLight.position.set(-2, 2, 2);
    scene.add(fillLight);

    let angle = 0;
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      angle += 0.006;
      sphere.rotation.y = angle;
      sphere.rotation.x = Math.sin(angle * 0.5) * 0.08;
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    animate();

    return () => {
      cancelAnimationFrame(rafRef.current);
      geometry.dispose();
      material.dispose();
    };
  }, [color, uri, premium]);

  return (
    <View style={[styles.root, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.photo, { width: size, height: size, borderRadius: size / 2 }]}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
          <Text style={[styles.initial, { fontSize: size * 0.35 }]}>{initials(name || "U")}</Text>
        </View>
      )}

      <GLView
        style={[styles.glOverlay, { width: size, height: size, borderRadius: size / 2 }]}
        onContextCreate={onContextCreate}
      />

      {premium && (
        <View style={[styles.premiumRing, { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  photo: {
    position: "absolute",
  },
  fallback: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
  },
  glOverlay: {
    position: "absolute",
  },
  premiumRing: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#D4A853",
    top: -2,
    left: -2,
  },
});
