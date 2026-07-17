/**
 * Yachiyo's small integration layer around the official Cubism 5 Web Framework.
 * The proprietary Cubism Core script is deliberately supplied by the user at runtime.
 */

import { CubismDefaultParameterId } from '../../vendor/live2d-framework/src/cubismdefaultparameterid'
import { CubismModelSettingJson } from '../../vendor/live2d-framework/src/cubismmodelsettingjson'
import {
  BreathParameterData,
  CubismBreath
} from '../../vendor/live2d-framework/src/effect/cubismbreath'
import { CubismEyeBlink } from '../../vendor/live2d-framework/src/effect/cubismeyeblink'
import {
  CubismLook,
  LookParameterData
} from '../../vendor/live2d-framework/src/effect/cubismlook'
import type { ICubismModelSetting } from '../../vendor/live2d-framework/src/icubismmodelsetting'
import type { CubismIdHandle } from '../../vendor/live2d-framework/src/id/cubismid'
import { CubismFramework } from '../../vendor/live2d-framework/src/live2dcubismframework'
import { CubismMatrix44 } from '../../vendor/live2d-framework/src/math/cubismmatrix44'
import { CubismUserModel } from '../../vendor/live2d-framework/src/model/cubismusermodel'
import { ACubismMotion } from '../../vendor/live2d-framework/src/motion/acubismmotion'
import { CubismBreathUpdater } from '../../vendor/live2d-framework/src/motion/cubismbreathupdater'
import { CubismExpressionUpdater } from '../../vendor/live2d-framework/src/motion/cubismexpressionupdater'
import { CubismEyeBlinkUpdater } from '../../vendor/live2d-framework/src/motion/cubismeyeblinkupdater'
import { CubismLookUpdater } from '../../vendor/live2d-framework/src/motion/cubismlookupdater'
import { CubismMotion } from '../../vendor/live2d-framework/src/motion/cubismmotion'
import { CubismPhysicsUpdater } from '../../vendor/live2d-framework/src/motion/cubismphysicsupdater'
import { CubismPoseUpdater } from '../../vendor/live2d-framework/src/motion/cubismposeupdater'
import { CubismUpdateScheduler } from '../../vendor/live2d-framework/src/motion/cubismupdatescheduler'
import { CubismWebGLOffscreenManager } from '../../vendor/live2d-framework/src/rendering/cubismoffscreenmanager'
import { CubismShaderManager_WebGL } from '../../vendor/live2d-framework/src/rendering/cubismshader_webgl'

const PRIORITY_IDLE = 1
const PRIORITY_FORCE = 3
const SHADER_TIMEOUT_MS = 10_000

let frameworkUsers = 0

export type Live2DController = {
  destroy: () => void
  resize: () => void
  setExpression: (name: string) => boolean
  setLipSync: (value: number) => void
  setPointer: (x: number, y: number) => void
  setScale: (value: number) => void
  startMotion: (group: string, index: number) => boolean
}

export type Live2DOptions = {
  canvas: HTMLCanvasElement
  modelBaseUrl: string
  modelFile: string
  shaderBaseUrl: string
  scale: number
  onError?: (message: string) => void
}

export async function createYachiyoLive2D(options: Live2DOptions): Promise<Live2DController> {
  acquireFramework()

  const gl = options.canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    depth: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: true
  })
  if (!gl) {
    releaseFramework()
    throw new Error('WebGL 2 tidak tersedia pada perangkat ini.')
  }

  const model = new YachiyoModel(options.canvas, gl, options.modelBaseUrl, options.shaderBaseUrl)
  try {
    await model.initialize(options.modelFile)
  } catch (error) {
    model.release()
    releaseFramework()
    throw error
  }

  let destroyed = false
  let animationFrame = 0
  let lastFrame = performance.now()
  let scale = clamp(options.scale, 0.65, 1.5)

  const resize = (): void => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.round(options.canvas.clientWidth * pixelRatio))
    const height = Math.max(1, Math.round(options.canvas.clientHeight * pixelRatio))
    if (options.canvas.width !== width || options.canvas.height !== height) {
      options.canvas.width = width
      options.canvas.height = height
      gl.viewport(0, 0, width, height)
    }
  }

  const render = (now: number): void => {
    if (destroyed) return
    try {
      resize()
      const deltaSeconds = Math.min(0.1, Math.max(0, (now - lastFrame) / 1_000))
      lastFrame = now
      model.update(deltaSeconds)
      model.draw(scale)
      animationFrame = requestAnimationFrame(render)
    } catch (error) {
      destroyed = true
      options.onError?.(safeMessage(error, 'Render Live2D berhenti karena kesalahan lokal.'))
    }
  }

  resize()
  animationFrame = requestAnimationFrame(render)

  return {
    destroy: () => {
      if (destroyed && !animationFrame) return
      destroyed = true
      cancelAnimationFrame(animationFrame)
      animationFrame = 0
      model.release()
      releaseFramework()
    },
    resize,
    setExpression: (name) => model.setExpression(name),
    setLipSync: (value) => model.setLipSync(value),
    setPointer: (x, y) => model.setDragging(clamp(x, -1, 1), clamp(y, -1, 1)),
    setScale: (value) => {
      scale = clamp(value, 0.65, 1.5)
    },
    startMotion: (group, index) => model.startMotion(group, index)
  }
}

class YachiyoModel extends CubismUserModel {
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private readonly modelBaseUrl: string
  private readonly shaderBaseUrl: string
  private readonly expressions = new Map<string, ACubismMotion>()
  private readonly motions = new Map<string, CubismMotion>()
  private readonly textures: WebGLTexture[] = []
  private readonly eyeBlinkIds: CubismIdHandle[] = []
  private readonly lipSyncIds: CubismIdHandle[] = []
  private readonly scheduler = new CubismUpdateScheduler()
  private modelSetting: ICubismModelSetting | null = null
  private look: CubismLook | null = null
  private motionUpdated = false
  private lipSync = 0
  private idleGroup: string | null = null
  private ready = false
  private released = false

  constructor(
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    modelBaseUrl: string,
    shaderBaseUrl: string
  ) {
    super()
    this.canvas = canvas
    this.gl = gl
    this.modelBaseUrl = ensureTrailingSlash(modelBaseUrl)
    this.shaderBaseUrl = ensureTrailingSlash(shaderBaseUrl)
  }

  async initialize(modelFile: string): Promise<void> {
    const settingBytes = await this.fetchBuffer(modelFile)
    this.modelSetting = new CubismModelSettingJson(settingBytes, settingBytes.byteLength)
    const setting = this.modelSetting

    const modelName = setting.getModelFileName()
    if (!modelName) throw new Error('model3.json tidak menunjuk ke berkas MOC3.')
    const modelBytes = await this.fetchBuffer(modelName)
    this.loadModel(modelBytes, true)
    if (!this.getModel()) throw new Error('Cubism Core menolak berkas MOC3 Mao.')

    await this.loadExpressions(setting)
    await this.loadPhysicsAndPose(setting)
    this.setupEffects(setting)
    await this.loadUserDataIfPresent(setting)
    this.setupParameterIds(setting)
    this.setupLook()

    const layout = new Map<string, number>()
    setting.getLayoutMap(layout)
    this.getModelMatrix().setupFromLayout(layout)
    this.getModel().saveParameters()
    await this.loadMotions(setting)

    this.scheduler.sortUpdatableList()
    this.createRenderer(this.canvas.width, this.canvas.height)
    this.getRenderer().startUp(this.gl)
    this.getRenderer().loadShaders(this.shaderBaseUrl)
    await Promise.all(
      Array.from({ length: setting.getTextureCount() }, (_, index) =>
        this.loadTexture(index, setting.getTextureFileName(index))
      )
    )
    await waitForShaders(this.gl)
    this.getRenderer().setIsPremultipliedAlpha(true)
    this.ready = true
  }

  update(deltaSeconds: number): void {
    if (!this.ready || !this.getModel()) return
    const model = this.getModel()
    model.loadParameters()
    this.motionUpdated = false

    if (this._motionManager.isFinished()) {
      this.startIdleMotion()
    } else {
      this.motionUpdated = this._motionManager.updateMotion(model, deltaSeconds)
    }
    model.saveParameters()
    this.scheduler.onLateUpdate(model, deltaSeconds)

    for (const id of this.lipSyncIds) model.setParameterValueById(id, this.lipSync)
    model.update()
  }

  draw(scale: number): void {
    if (!this.ready || !this.getModel()) return
    const { width, height } = this.canvas
    if (width < 1 || height < 1) return

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
    this.gl.viewport(0, 0, width, height)
    this.gl.clearColor(0, 0, 0, 0)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    CubismWebGLOffscreenManager.getInstance().beginFrameProcess(this.gl)

    const projection = new CubismMatrix44()
    if (this.getModel().getCanvasWidth() > 1 && width < height) {
      this.getModelMatrix().setWidth(2)
      projection.scale(scale, (width / height) * scale)
    } else {
      projection.scale((height / width) * scale, scale)
    }
    projection.multiplyByMatrix(this.getModelMatrix())

    const renderer = this.getRenderer()
    renderer.setMvpMatrix(projection)
    renderer.setRenderState(null, [0, 0, width, height])
    renderer.drawModel(this.shaderBaseUrl)

    CubismWebGLOffscreenManager.getInstance().endFrameProcess(this.gl)
    CubismWebGLOffscreenManager.getInstance().releaseStaleRenderTextures(this.gl)
  }

  setLipSync(value: number): void {
    this.lipSync = clamp(value, 0, 1)
  }

  setExpression(name: string): boolean {
    const expression = this.expressions.get(name)
    if (!expression || !this.ready) return false
    this._expressionManager.startMotion(expression, false)
    return true
  }

  startMotion(group: string, index: number): boolean {
    const motion = this.motions.get(motionKey(group, index))
    if (!motion || !this.ready) return false
    this._motionManager.setReservePriority(PRIORITY_FORCE)
    this._motionManager.startMotionPriority(motion, false, PRIORITY_FORCE)
    return true
  }

  release(): void {
    if (this.released) return
    this.released = true
    this.ready = false
    this.scheduler.release()
    this._motionManager.stopAllMotions()
    this._expressionManager.stopAllMotions()
    for (const motion of this.motions.values()) ACubismMotion.delete(motion)
    for (const expression of this.expressions.values()) ACubismMotion.delete(expression)
    this.motions.clear()
    this.expressions.clear()
    for (const texture of this.textures) this.gl.deleteTexture(texture)
    this.textures.length = 0
    if (this.look) CubismLook.delete(this.look)
    this.look = null
    this.modelSetting?.release()
    this.modelSetting = null
    super.release()
  }

  private async loadExpressions(setting: ICubismModelSetting): Promise<void> {
    for (let index = 0; index < setting.getExpressionCount(); index += 1) {
      const name = setting.getExpressionName(index)
      const file = setting.getExpressionFileName(index)
      const bytes = await this.fetchBuffer(file)
      const expression = this.loadExpression(bytes, bytes.byteLength, name)
      if (expression) this.expressions.set(name, expression)
    }
    if (this.expressions.size > 0) {
      this.scheduler.addUpdatableList(new CubismExpressionUpdater(this._expressionManager))
    }
  }

  private async loadPhysicsAndPose(setting: ICubismModelSetting): Promise<void> {
    const physicsFile = setting.getPhysicsFileName()
    if (physicsFile) {
      const bytes = await this.fetchBuffer(physicsFile)
      this.loadPhysics(bytes, bytes.byteLength)
      if (this._physics) this.scheduler.addUpdatableList(new CubismPhysicsUpdater(this._physics))
    }

    const poseFile = setting.getPoseFileName()
    if (poseFile) {
      const bytes = await this.fetchBuffer(poseFile)
      this.loadPose(bytes, bytes.byteLength)
      if (this._pose) this.scheduler.addUpdatableList(new CubismPoseUpdater(this._pose))
    }
  }

  private setupEffects(setting: ICubismModelSetting): void {
    if (setting.getEyeBlinkParameterCount() > 0) {
      this._eyeBlink = CubismEyeBlink.create(setting)
      this.scheduler.addUpdatableList(
        new CubismEyeBlinkUpdater(() => this.motionUpdated, this._eyeBlink)
      )
    }

    this._breath = CubismBreath.create()
    this._breath.setParameters([
      new BreathParameterData(this.id(CubismDefaultParameterId.ParamAngleX), 0, 15, 6.5345, 0.5),
      new BreathParameterData(this.id(CubismDefaultParameterId.ParamAngleY), 0, 8, 3.5345, 0.5),
      new BreathParameterData(this.id(CubismDefaultParameterId.ParamAngleZ), 0, 10, 5.5345, 0.5),
      new BreathParameterData(
        this.id(CubismDefaultParameterId.ParamBodyAngleX),
        0,
        4,
        15.5345,
        0.5
      ),
      new BreathParameterData(this.id(CubismDefaultParameterId.ParamBreath), 0.5, 0.5, 3.2345, 1)
    ])
    this.scheduler.addUpdatableList(new CubismBreathUpdater(this._breath))
  }

  private async loadUserDataIfPresent(setting: ICubismModelSetting): Promise<void> {
    const userDataFile = setting.getUserDataFile()
    if (!userDataFile) return
    const bytes = await this.fetchBuffer(userDataFile)
    this.loadUserData(bytes, bytes.byteLength)
  }

  private setupParameterIds(setting: ICubismModelSetting): void {
    for (let index = 0; index < setting.getEyeBlinkParameterCount(); index += 1) {
      this.eyeBlinkIds.push(setting.getEyeBlinkParameterId(index))
    }
    for (let index = 0; index < setting.getLipSyncParameterCount(); index += 1) {
      this.lipSyncIds.push(setting.getLipSyncParameterId(index))
    }
  }

  private setupLook(): void {
    this.look = CubismLook.create()
    this.look.setParameters([
      new LookParameterData(this.id(CubismDefaultParameterId.ParamAngleX), 30, 0, 0),
      new LookParameterData(this.id(CubismDefaultParameterId.ParamAngleY), 0, 30, 0),
      new LookParameterData(this.id(CubismDefaultParameterId.ParamAngleZ), 0, 0, -30),
      new LookParameterData(this.id(CubismDefaultParameterId.ParamBodyAngleX), 10, 0, 0),
      new LookParameterData(this.id(CubismDefaultParameterId.ParamEyeBallX), 1, 0, 0),
      new LookParameterData(this.id(CubismDefaultParameterId.ParamEyeBallY), 0, 1, 0)
    ])
    this.scheduler.addUpdatableList(new CubismLookUpdater(this.look, this._dragManager))
  }

  private async loadMotions(setting: ICubismModelSetting): Promise<void> {
    for (let groupIndex = 0; groupIndex < setting.getMotionGroupCount(); groupIndex += 1) {
      const group = setting.getMotionGroupName(groupIndex)
      if (group.toLowerCase() === 'idle') this.idleGroup = group
      for (let index = 0; index < setting.getMotionCount(group); index += 1) {
        const bytes = await this.fetchBuffer(setting.getMotionFileName(group, index))
        const motion = this.loadMotion(
          bytes,
          bytes.byteLength,
          motionKey(group, index),
          undefined,
          undefined,
          setting,
          group,
          index,
          true
        )
        if (!motion) continue
        motion.setEffectIds(this.eyeBlinkIds, this.lipSyncIds)
        this.motions.set(motionKey(group, index), motion)
      }
    }
  }

  private startIdleMotion(): void {
    if (!this.idleGroup || !this.modelSetting) return
    const count = this.modelSetting.getMotionCount(this.idleGroup)
    if (count < 1) return
    const index = Math.floor(Math.random() * count)
    const motion = this.motions.get(motionKey(this.idleGroup, index))
    if (!motion || !this._motionManager.reserveMotion(PRIORITY_IDLE)) return
    this._motionManager.startMotionPriority(motion, false, PRIORITY_IDLE)
  }

  private async loadTexture(index: number, file: string): Promise<void> {
    if (!file) return
    const response = await fetch(this.assetUrl(file), { cache: 'no-store' })
    if (!response.ok) throw new Error(`Texture Live2D gagal dimuat (${response.status}).`)
    const bitmap = await createImageBitmap(await response.blob(), {
      premultiplyAlpha: 'premultiply'
    })
    const texture = this.gl.createTexture()
    if (!texture) {
      bitmap.close()
      throw new Error('WebGL tidak dapat membuat texture Live2D.')
    }
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
    this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      bitmap
    )
    this.gl.generateMipmap(this.gl.TEXTURE_2D)
    this.gl.bindTexture(this.gl.TEXTURE_2D, null)
    bitmap.close()
    this.textures.push(texture)
    this.getRenderer().bindTexture(index, texture)
  }

  private async fetchBuffer(relativePath: string): Promise<ArrayBuffer> {
    const response = await fetch(this.assetUrl(relativePath), { cache: 'no-store' })
    if (!response.ok) throw new Error(`Aset Live2D gagal dimuat (${response.status}).`)
    return response.arrayBuffer()
  }

  private assetUrl(relativePath: string): string {
    const encoded = relativePath
      .replaceAll('\\', '/')
      .split('/')
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join('/')
    return new URL(encoded, this.modelBaseUrl).href
  }

  private id(value: string): CubismIdHandle {
    return CubismFramework.getIdManager().getId(value)
  }
}

function acquireFramework(): void {
  if (!(globalThis as { Live2DCubismCore?: unknown }).Live2DCubismCore) {
    throw new Error('Cubism Core resmi belum dimuat.')
  }
  if (frameworkUsers === 0) {
    if (!CubismFramework.startUp()) throw new Error('Cubism Framework gagal dimulai.')
    CubismFramework.initialize()
  }
  frameworkUsers += 1
}

function releaseFramework(): void {
  frameworkUsers = Math.max(0, frameworkUsers - 1)
  if (frameworkUsers === 0) {
    CubismFramework.dispose()
    CubismFramework.cleanUp()
  }
}

async function waitForShaders(gl: WebGL2RenderingContext): Promise<void> {
  const started = performance.now()
  while (performance.now() - started < SHADER_TIMEOUT_MS) {
    const shader = CubismShaderManager_WebGL.getInstance().getShader(gl)
    if (shader?._isShaderLoaded) return
    if (shader && !shader._isShaderLoading) break
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Shader resmi Cubism tidak dapat dimuat.')
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function motionKey(group: string, index: number): string {
  return `${group}\u0000${index}`
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum))
}

function safeMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
