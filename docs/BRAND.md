# IDENTIDAD — Solo Laboral Abogados

Fuente: **sololaboral.mx**, el sitio oficial del despacho.
Nada de este documento es interpretación de diseño: los colores se leyeron de
las variables CSS del propio sitio y del SVG del logotipo, y los archivos de
logotipo se copiaron sin modificar.

---

## 1. Colores de marca

Tal como los declara el sitio:

| Variable del sitio | Valor | Nombre aquí |
|---|---|---|
| `--c-primary` | `#00A9F3` | cian |
| `--c-secondary` | `#00E7AD` | menta |
| `--c-text` / `--c-blue1` | `#2B346B` | azul marino |

Los tres aparecen literalmente en `public/brand/logo.svg`. El sitio declara
además `#262D58`, `#130E22`, `#2A2F4A` y `#111429` como azules de apoyo.

---

## 2. Por qué el azul marino conduce el producto

El sitio del despacho es **oscuro**, y ahí el cian y la menta funcionan en
superficies grandes. Este producto —la página pública y el portal— es **claro**,
y sobre blanco esos dos colores no son legibles:

| Color | Contraste sobre blanco | ¿Sirve como texto? |
|---|---:|---|
| cian `#00A9F3` | 2.64:1 | **No** (mínimo AA: 4.5:1) |
| menta `#00E7AD` | 1.61:1 | **No** |
| azul marino `#2B346B` | 11.63:1 | Sí, con holgura |

Por eso:

- el **azul marino** conduce la interfaz: títulos, botones primarios, enlaces,
  folios;
- el **cian** y la **menta** se conservan íntegros donde son áreas grandes y no
  texto: el filete de marca (`.sl-rule`) que corona ambas caras, e insignias;
- para los casos en que el cian o la menta necesitan leerse como texto, se usa
  una versión oscurecida del **mismo matiz**, no otro color.

Ningún tono se inventó para "completar" la paleta.

---

## 3. Tokens del portal

Declarados en `src/app/globals.css`. Todos como canales RGB para que Tailwind
pueda aplicarles opacidad.

| Token | Valor | Origen | Contraste sobre blanco |
|---|---|---|---:|
| `--sl-primary` | `#2B346B` | marca, sin alterar | 11.63:1 |
| `--sl-secondary` | `#00A9F3` | marca, sin alterar | — (no es texto) |
| `--sl-accent` | `#00E7AD` | marca, sin alterar | — (no es texto) |
| `--sl-secondary-strong` | `#0076AA` | cian oscurecido, para texto | 5.03:1 |
| `--sl-text` | `#130E22` | azul casi negro del sitio | 18.86:1 |
| `--sl-muted` | `#5A6183` | derivado del matiz marino | 6.05:1 |
| `--sl-border` | `#DDE2EF` | derivado del matiz marino | — |
| `--sl-primary-soft` | `#E9EDF7` | derivado del matiz marino | — |
| `--sl-background` | `#F4F6FB` | derivado del matiz marino | — |
| `--sl-surface` | `#FFFFFF` | blanco | — |
| `--sl-success` | `#00775A` | **menta de marca oscurecida** | 5.55:1 |
| `--sl-warning` | `#97590B` | color de estado (la marca no lo define) | 5.60:1 |
| `--sl-danger` | `#CE1111` | color de estado, sobre el rojo del sitio | 5.66:1 |

Éxito, aviso y peligro son colores **de estado**, no de marca: la identidad de
Solo Laboral no los define. "Éxito" se derivó de la menta del despacho para que
al menos ese matiz siga siendo suyo — y es el color de la pantalla que le dice
a una persona que su caso pasó el filtro inicial.

Todos los tonos que se usan como texto pasan WCAG AA, también sobre el fondo
tenue de sus propias etiquetas (verificado, mínimo obtenido 4.75:1).

---

## 4. Tipografía

**Poppins**, la del sitio oficial. Se carga con `next/font/google`, que la
descarga en tiempo de build y la sirve desde el propio dominio: la página **no
hace ninguna petición a Google en runtime**. Eso importa más aquí que en un
portal interno: la cara pública la abre gente en redes móviles lentas, y una
petición menos a un tercero es una fuente menos de retraso y de rastreo.
Pesos 400, 500, 600 y 700.

---

## 5. Logotipo

En `public/brand/`, copiados sin modificar:

| Archivo | Qué es | Dónde se usa |
|---|---|---|
| `logo.svg` | lockup completo, 500 × 305 | encabezado público, acceso, cabecera del portal |
| `isotipo.svg` | marca sin texto, 300 × 191 | espacios estrechos |
| `isotipo-menta.svg` | forma menta suelta | reserva |

Reglas:

- **no se redibuja** el logotipo;
- **no se recolorea**;
- **no se reconstruye el lockup** escribiendo el nombre con una tipografía
  parecida;
- el despacho solo entrega una versión **vertical**, así que se usa vertical y
  en tamaños discretos, en lugar de fabricar una horizontal que no existe.

El logotipo contiene trazos en azul marino, así que **no puede ir sobre un
fondo marino**: se perderían. Por eso el encabezado de ambas caras es blanco, y
la marca aparece en el color que le toca, sin recolorear.

Todo pasa por `src/components/brand/Logo.tsx`. Ningún otro archivo referencia
las rutas de los SVG.

Los iconos de pestaña (`public/favicon.ico`, `public/apple-icon.png`) también
son los del sitio oficial.

---

## 6. Si el despacho entrega un manual de marca

Lo esperable es que solo cambien valores, no componentes:

1. colores → `src/app/globals.css` (bloque `:root`);
2. tipografía → `src/app/layout.tsx`;
3. archivos de logotipo → `public/brand/`.

Ningún componente tiene un color escrito a mano, así que no hay que buscar
`#2B346B` por el código: no aparece fuera de ese bloque y de los propios SVG.

Si el manual trae un lockup **horizontal**, una paleta ampliada o tonos
oficiales de estado, conviene incorporarlos: son justo las piezas que hoy están
derivadas.
