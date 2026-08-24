# NovelWriter AI
Es un plugin de Obsidian para escribir novelas con IA.

## Stack
- Javascript sobre Typescript
- React para front.
- Zustand para manejo de estados.

## Features
- Companion View: Vista lateral con varias funcionalidades
    - Novel picker: Permite gestionar novelas y elegir novela activa.
    - Codex Tab: Te permite manejar entradas de lore en el codex de la novela.
    - Config Tab: Permite ver el contexto, configurar memoria y notas del autor para autocompletado.
    - Chat tab: Permite chatear con la IA para brainstorming, refinamiento de capitulos y roleplay para hablar con los personajes de la historia.
- Outline View: Permite generar un outline y luego generar manuscritos a traves de este outline.
- Gestión de modelos: Puedes crear modelos de varios proveedores y luego cambiar entre ellos.
- Gestión de prompts: Se pueden manejar prompts para chat y para autocompletado aparte.

## Providers
Proveedores soportados

- Openrouter
- Deepseek
- Ollama
- Opencode Zen
- Opencode Go
- Anthropic => API Pay as you GO.
- Anthropic - Claude Code (No sirve en mobile) => Para usar con suscripción
- Novel AI
- Oobabooga text generation web-ui

## Convenciones

Aplicar estos estándares.

1. Principio de responsabilidad única: 
    Una clase debe tener una sola razón para cambiar, lo que implica tener un único propósito o responsabilidad.
    Evitar hacer archivos de .tsx muy grandes y separar componentes en archivos distintos.

2. Principio de sustitución de Liskov: 
    Los objetos de una clase base deben ser reemplazables por instancias de sus subclases sin alterar
    el correcto funcionamiento del programa.

3. Principio de Segregación de Interfaces (ISP): Los clientes no deben verse forzados a depender de interfaces que no utilizan; es mejor tener muchas interfaces específicas que una general

4. Principio de Inversión de la Dependencia (DIP): Los módulos de alto nivel no deben depender de módulos de bajo nivel, sino ambos deben depender de abstracciones

5. Lenguaje Ingles: Si bien el modelo y algunas funciones pueden estar en español, por favor hacer todo en inglés de ahora en adelante. Igual el texto de las opciones y configuraciones.

## Carpetas
src/apis => Aqui solo van las API's nada más. No poner utils, ni types, ni nada raro.
src/constants => Aquí constantes globales.
src/context => Helpers para contexto.
src/domain => Codigo del Dominio, entidades y tipos, etc...
src/factories => Factories para clases.
src/infraestructura => Base del plugin, tiene el storage y settings.
src/interfaces => Interfaces y contratos.
src/types => Tipos globales. Hay que mover aqui lo de src/domain/types. Una IA sin mucho criterio hizo duplicados.
src/ui => Interfaz gráfica, componentes React.
src/utils => Útiles varios.

No crear nuevas carpetas y al crear nuevos archivos NO PONER EN LUGARES INDEBIDOS.

Seguir las convenciones, preguntar si crees que algún archivo no cabe dentro de estas definiciones
y quizás ahi se puede hacer una carpeta nueva.

Está permitido crear subcarpetas dentro de las mencionadas, pero con criterio.