import type { Modelo } from '../../domain/entities/Modelo';
import type { SettingsService } from './settings-service';
import { genId } from '../../utils/ids';

/** Storage abstraction for saved models, backed by the plugin settings for now. */
export class ModelRepository {
	constructor(private readonly settings: SettingsService) {}

	list(): Modelo[] {
		return [...this.settings.data.modelos];
	}

	get(id: string): Modelo | undefined {
		return this.settings.data.modelos.find(model => model.id_modelo === id);
	}

	getDefault(): Modelo | undefined {
		return this.get(this.settings.data.modeloPredeterminadoId);
	}

	async save(model: Omit<Modelo, 'id_modelo' | 'created_at' | 'updated_at'> & Partial<Pick<Modelo, 'id_modelo'>>): Promise<Modelo> {
		const now = new Date().toISOString();
		const existing = model.id_modelo ? this.get(model.id_modelo) : undefined;
		const saved: Modelo = {
			...model,
			id_modelo: existing?.id_modelo ?? genId(),
			created_at: existing?.created_at ?? now,
			updated_at: now,
		};
		const index = this.settings.data.modelos.findIndex(item => item.id_modelo === saved.id_modelo);
		if (index >= 0) this.settings.data.modelos[index] = saved;
		else this.settings.data.modelos.push(saved);
		if (!this.settings.data.modeloPredeterminadoId) this.settings.data.modeloPredeterminadoId = saved.id_modelo;
		await this.settings.save();
		return saved;
	}

	async setDefault(id: string): Promise<void> {
		if (!this.get(id)) throw new Error('El modelo seleccionado no existe.');
		this.settings.data.modeloPredeterminadoId = id;
		await this.settings.save();
	}

	async remove(id: string): Promise<void> {
		this.settings.data.modelos = this.settings.data.modelos.filter(model => model.id_modelo !== id);
		if (this.settings.data.modeloPredeterminadoId === id) {
			this.settings.data.modeloPredeterminadoId = this.settings.data.modelos[0]?.id_modelo ?? '';
		}
		await this.settings.save();
	}
}
