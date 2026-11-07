import {
  ArrowUp, CircleParking, Container, Droplet, Droplets, Ellipsis, FileText, Filter, Fuel, Lock, Megaphone,
  Heart, Package, Scissors, Shirt, ShieldCheck, Smartphone, SprayCan, Sprout, Trash2, Truck, User, Wallet, Wrench,
  type LucideIcon, type LucideProps,
} from 'lucide-react';

// Iconos de trazo (Lucide, stroke 2, extremos redondeados; §6.4). Uno por categoría (§9.2).
const ICONOS: Record<string, LucideIcon> = {
  ArrowUp, CircleParking, Container, Droplet, Droplets, Ellipsis, FileText, Filter, Fuel, Heart, Lock, Megaphone,
  Package, Scissors, Shirt, ShieldCheck, Smartphone, SprayCan, Sprout, Trash2, Truck, User, Wallet, Wrench,
};

export function Icono({ nombre, ...props }: { nombre: string } & LucideProps) {
  const Componente = ICONOS[nombre] ?? Ellipsis;
  return <Componente aria-hidden="true" strokeWidth={2} {...props} />;
}
