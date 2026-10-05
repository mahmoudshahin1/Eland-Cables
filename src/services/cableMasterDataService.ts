import {
  AllCableParameterMasters,
  CableFamilyMaster,
  VoltageMaster,
  ConductorMaterialMaster,
  ConductorClassMaster,
  CoreConfigurationMaster,
  InsulationMaterialMaster,
  ScreenTypeMaster,
  ArmourTypeMaster,
  SheathingMaterialMaster,
  SheathingColorMaster,
  CableStandardMaster,
} from '../types';
import {
  ALL_INITIAL_CABLE_PARAMETER_MASTERS,
  INITIAL_CABLE_FAMILIES,
  INITIAL_VOLTAGES,
  INITIAL_CONDUCTOR_MATERIALS,
  INITIAL_CONDUCTOR_CLASSES,
  INITIAL_CORES,
  INITIAL_INSULATIONS,
  INITIAL_SCREEN_TYPES,
  INITIAL_ARMOURS,
  INITIAL_SHEATHINGS,
  INITIAL_SHEATHING_COLORS,
  INITIAL_CABLE_STANDARDS,
} from '../data/cableParameterMasters';

const STORAGE_KEY_PREFIX = 'energya_cable_parameter_masters_v1';

class CableMasterDataService {
  private getStorageKey(category: keyof AllCableParameterMasters): string {
    return `${STORAGE_KEY_PREFIX}_${category}`;
  }

  // --- Generic Storage Getters & Setters ---
  private loadCategory<T>(category: keyof AllCableParameterMasters, fallback: T[]): T[] {
    try {
      const raw = localStorage.getItem(this.getStorageKey(category));
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  private saveCategory<T>(category: keyof AllCableParameterMasters, data: T[]): void {
    try {
      localStorage.setItem(this.getStorageKey(category), JSON.stringify(data));
      window.dispatchEvent(
        new CustomEvent('cableMasterDataUpdated', {
          detail: { category, count: data.length },
        })
      );
    } catch (err) {
      console.error(`Failed to persist cable master category: ${category}`, err);
    }
  }

  // --- Category Getters ---
  public getFamilies(onlyActive = true): CableFamilyMaster[] {
    const list = this.loadCategory<CableFamilyMaster>('families', INITIAL_CABLE_FAMILIES);
    return list
      .filter((item) => (onlyActive ? item.active : true))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public getVoltages(onlyActive = true, familyCode?: string, voltageClass?: string): VoltageMaster[] {
    const list = this.loadCategory<VoltageMaster>('voltages', INITIAL_VOLTAGES);
    return list
      .filter((item) => {
        if (onlyActive && !item.active) return false;
        if (voltageClass && item.voltageClass !== voltageClass) return false;
        if (familyCode && item.applicableFamilies && item.applicableFamilies.length > 0) {
          return item.applicableFamilies.includes(familyCode) || item.applicableFamilies.includes('UGC');
        }
        return true;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public getConductorMaterials(onlyActive = true): ConductorMaterialMaster[] {
    const list = this.loadCategory<ConductorMaterialMaster>('conductorMaterials', INITIAL_CONDUCTOR_MATERIALS);
    return list
      .filter((item) => (onlyActive ? item.active : true))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public getConductorClasses(onlyActive = true): ConductorClassMaster[] {
    const list = this.loadCategory<ConductorClassMaster>('conductorClasses', INITIAL_CONDUCTOR_CLASSES);
    return list
      .filter((item) => (onlyActive ? item.active : true))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public getCores(onlyActive = true): CoreConfigurationMaster[] {
    const list = this.loadCategory<CoreConfigurationMaster>('cores', INITIAL_CORES);
    return list
      .filter((item) => (onlyActive ? item.active : true))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public getInsulations(onlyActive = true): InsulationMaterialMaster[] {
    const list = this.loadCategory<InsulationMaterialMaster>('insulations', INITIAL_INSULATIONS);
    return list
      .filter((item) => (onlyActive ? item.active : true))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public getScreenTypes(onlyActive = true, voltageClass?: string): ScreenTypeMaster[] {
    const list = this.loadCategory<ScreenTypeMaster>('screenTypes', INITIAL_SCREEN_TYPES);
    return list
      .filter((item) => {
        if (onlyActive && !item.active) return false;
        if (voltageClass && item.applicableVoltages && item.applicableVoltages.length > 0) {
          return item.applicableVoltages.includes(voltageClass);
        }
        return true;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public getArmours(onlyActive = true): ArmourTypeMaster[] {
    const list = this.loadCategory<ArmourTypeMaster>('armours', INITIAL_ARMOURS);
    return list
      .filter((item) => (onlyActive ? item.active : true))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public getSheathings(onlyActive = true): SheathingMaterialMaster[] {
    const list = this.loadCategory<SheathingMaterialMaster>('sheathings', INITIAL_SHEATHINGS);
    return list
      .filter((item) => (onlyActive ? item.active : true))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public getSheathingColors(onlyActive = true): SheathingColorMaster[] {
    const list = this.loadCategory<SheathingColorMaster>('sheathingColors', INITIAL_SHEATHING_COLORS);
    return list
      .filter((item) => (onlyActive ? item.active : true))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public getStandards(onlyActive = true, voltageClass?: string, familyCode?: string): CableStandardMaster[] {
    const list = this.loadCategory<CableStandardMaster>('standards', INITIAL_CABLE_STANDARDS);
    return list
      .filter((item) => {
        if (onlyActive && !item.active) return false;
        if (voltageClass && item.voltageClass && item.voltageClass !== voltageClass) return false;
        if (familyCode && item.applicableFamilies && item.applicableFamilies.length > 0) {
          return item.applicableFamilies.includes(familyCode) || item.applicableFamilies.includes('UGC');
        }
        return true;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public getAllMasters(onlyActive = false): AllCableParameterMasters {
    return {
      families: this.getFamilies(onlyActive),
      voltages: this.getVoltages(onlyActive),
      conductorMaterials: this.getConductorMaterials(onlyActive),
      conductorClasses: this.getConductorClasses(onlyActive),
      cores: this.getCores(onlyActive),
      insulations: this.getInsulations(onlyActive),
      screenTypes: this.getScreenTypes(onlyActive),
      armours: this.getArmours(onlyActive),
      sheathings: this.getSheathings(onlyActive),
      sheathingColors: this.getSheathingColors(onlyActive),
      standards: this.getStandards(onlyActive),
    };
  }

  // --- Category Setters / Updaters ---
  public updateCategory<K extends keyof AllCableParameterMasters>(
    category: K,
    items: AllCableParameterMasters[K]
  ): void {
    this.saveCategory(category, items);
  }

  public resetCategoryToDefaults(category: keyof AllCableParameterMasters): void {
    const fallback = ALL_INITIAL_CABLE_PARAMETER_MASTERS[category];
    this.saveCategory(category, fallback);
  }

  public resetAllToDefaults(): void {
    (Object.keys(ALL_INITIAL_CABLE_PARAMETER_MASTERS) as (keyof AllCableParameterMasters)[]).forEach(
      (cat) => {
        this.saveCategory(cat, ALL_INITIAL_CABLE_PARAMETER_MASTERS[cat]);
      }
    );
  }
}

export const cableMasterDataService = new CableMasterDataService();
