import math

def calculate_composite_difficulty(an, bn, T):
    """
    计算复合难度和复合难占比（与旧版 JS 保持一致）
    
    参数:
    an: 原始数组 [a0, a1, ..., an]
    bn: 标记数组 [b0, b1, ..., b(n+1)]，仅包含1和2
    T: 阈值参数
    
    返回:
    total_difficulty: 复合难度之和
    difficulty_ratio: 复合难占比
    marks: L/R标记数组
    hand_change: 换手标记数组
    sync: 同步标记数组
    base_coeff: 基础系数数组
    """
    # 验证输入
    if len(bn) != len(an) + 1:
        raise ValueError(f"bn数组长度应为{len(an)+1}，实际为{len(bn)}")
    
    for b in bn:
        if b not in [1, 2]:
            raise ValueError(f"bn数组只能包含1和2，发现值: {b}")
    
    # 步骤1: 补0并标记L/R
    a = an.copy()
    a.append(0)  # 补a(n+1)=0
    n = len(a)
    
    # 步骤2: 标记L/R
    marks = [''] * n
    marks[0] = 'R'  # a0标记为R
    
    for i in range(1, n):
        if marks[i-1] == 'R' and a[i-1] < T:
            marks[i] = 'L'
        else:
            marks[i] = 'R'
    
    # 验证标记规则：不可能有连续两个L
    # (无需打印警告，在批量计算中避免 I/O 开销)
    
    # 步骤1.1: 标记换手(hand_change)
    hand_change = [None] * n
    
    # 记录每个标记类型上一次出现的位置
    last_R_index = 0
    last_L_index = None
    
    for i in range(1, n):
        if marks[i] == 'R':
            if last_R_index is not None and i != last_R_index:
                if bn[last_R_index] != bn[i]:
                    hand_change[i] = 1
                else:
                    hand_change[i] = 0
            last_R_index = i
        else:  # marks[i] == 'L'
            if last_L_index is not None:
                if bn[last_L_index] != bn[i]:
                    hand_change[i] = 1
                else:
                    hand_change[i] = 0
            last_L_index = i
    
    # 步骤1.2: 标记同步(sync)
    sync = [None] * n
    
    # 记录每个标记类型上两次出现的位置
    second_last_R_index = None
    second_last_L_index = None
    last_R_index = None
    last_L_index = None
    
    for i in range(n):
        if marks[i] == 'R':
            if second_last_R_index is not None:
                if hand_change[last_R_index] is not None and hand_change[i] is not None:
                    if hand_change[last_R_index] == hand_change[i]:
                        sync[i] = 1
                    else:
                        sync[i] = 0
            
            second_last_R_index = last_R_index
            last_R_index = i
            
        else:  # marks[i] == 'L'
            if second_last_L_index is not None:
                if hand_change[last_L_index] is not None and hand_change[i] is not None:
                    if hand_change[last_L_index] == hand_change[i]:
                        sync[i] = 1
                    else:
                        sync[i] = 0
            
            second_last_L_index = last_L_index
            last_L_index = i
    
    # 步骤3: 计算基础系数（从第3个L开始）
    base_coeff = [0] * n

    l_count = 0
    third_l_index = None
    for i in range(n):
        if marks[i] == 'L':
            l_count += 1
            if l_count == 3:
                third_l_index = i
                break

    if third_l_index is not None:
        for i in range(third_l_index, n):
            if i == third_l_index:
                base_coeff[i] = 0
                continue

            current_mark = marks[i]
            prev_mark = marks[i - 1] if i - 1 >= 0 else None
            prev_prev_mark = marks[i - 2] if i - 2 >= 0 else None

            if (
                prev_mark is not None
                and current_mark != prev_mark
                and prev_prev_mark is not None
                and current_mark == prev_prev_mark
            ):
                if sync[i] is not None and sync[i - 1] is not None:
                    base_coeff[i] = 1 if sync[i] != sync[i - 1] else 0
                else:
                    base_coeff[i] = 0
            else:
                base_coeff[i] = 0

    # 步骤4-5: 计算复合难度
    total_difficulty = 0
    
    def get_interval_coeff(value):
        threshold_low = 15/130 * 1000
        threshold_high = 15/90 * 1000
        
        if value <= threshold_low:
            return 1.0
        elif value >= threshold_high:
            return 0.0
        else:
            return 1.0 - (value - threshold_low) / (threshold_high - threshold_low)
    
    if third_l_index is not None:
        for i in range(third_l_index, n):
            a_coeff = base_coeff[i]
            if i >= 2:
                b_coeff_prev1 = get_interval_coeff(a[i - 1])
                b_coeff_prev2 = get_interval_coeff(a[i - 2])
                b_coeff = b_coeff_prev1 * b_coeff_prev2
                total_difficulty += a_coeff * b_coeff
    
    # 计算复合难占比
    difficulty_ratio = total_difficulty / len(an) if len(an) > 0 else 0
    
    return total_difficulty, difficulty_ratio, marks, hand_change, sync, base_coeff


def compute_final_composite_difficulty(an, bn):
    """
    完整的复合难度计算方法（考虑T的选择）
    
    参数:
    an: 原始数组 [a0, a1, ..., an]
    bn: 标记数组 [b0, b1, ..., b(n+1)]，仅包含1和2
    
    返回:
    final_difficulty: 最终复合难度之和
    final_ratio: 最终复合难占比
    T_used: 使用的T值（或计算方法说明）
    marks: L/R标记数组
    hand_change: 换手标记数组
    sync: 同步标记数组
    sub_array_details: 子数组详细信息列表
    """
    # 计算阈值
    t_low = 30/260 * 1000
    t_high = 30/180 * 1000
    t0 = t_high
    tm = t_low
    
    candidate_values = sorted(set(v for v in an if tm < v < t0), reverse=True)
    
    if not candidate_values:
        difficulty, ratio, *_ = calculate_composite_difficulty(an, bn, t0)
        return difficulty, ratio
    
    T_values = [t0] + candidate_values
    
    difficulties = [calculate_composite_difficulty(an, bn, T)[0] for T in T_values]
    
    weights = [1/T_values[i+1] - 1/T_values[i] for i in range(len(T_values) - 1)]
    weights.append(1/tm - 1/T_values[-1])
    
    total_weight = sum(weights)
    
    if total_weight <= 0:
        weighted_geometric = difficulties[0]
    else:
        weighted_sum_log = 0
        all_positive = True
        for i, difficulty in enumerate(difficulties):
            if difficulty > 0:
                weighted_sum_log += math.log(difficulty) * weights[i]
            else:
                all_positive = False
                weighted_geometric = 0
                break
        if all_positive:
            weighted_geometric = math.exp(weighted_sum_log / total_weight)
    
    final_ratio = weighted_geometric / len(an) if len(an) > 0 else 0
    
    return weighted_geometric, final_ratio


# 测试函数
def test_composite_difficulty():
    """测试复合难度计算"""
    
    print("复合难度计算测试（新逻辑）")
    print("=" * 60)
    
    # 测试1: 验证标记规则
    print("测试1: 验证标记规则")
    an1 = [100, 120, 80, 150, 90, 110, 130]
    bn1 = [1, 2, 1, 2, 1, 1, 2, 1]
    T1 = 100
    
    difficulty1, ratio1, marks1, hand_change1, sync1, sub_arrays1 = calculate_composite_difficulty(an1, bn1, T1)
    
    print(f"an数组: {an1}")
    print(f"T值: {T1}")
    print(f"L/R标记: {marks1}")
    print(f"标记序列: {' '.join(marks1)}")
    
    # 验证标记规则
    print("\n验证标记规则:")
    for i in range(1, len(marks1)):
        if marks1[i] == 'L':
            print(f"  a[{i}]是L，检查a[{i-1}]必须是R且a[{i-1}]<T")
            print(f"  a[{i-1}]={an1[i-1] if i-1 < len(an1) else 0}, 标记:{marks1[i-1]}, 条件: marks[{i-1}]=='R' and a[{i-1}]<{T1}")
            condition_met = marks1[i-1] == 'R' and (an1[i-1] if i-1 < len(an1) else 0) < T1
            print(f"  结果: {'满足' if condition_met else '不满足'}")
    
    print(f"\n子数组信息:")
    for i, sub in enumerate(sub_arrays1):
        print(f"  子数组{i+1}: 起始索引={sub['start']}, 结束索引={sub['end']}, 长度={sub['length']}")
        print(f"          标记序列: {sub['marks']}")
        print(f"          难度: {sub['difficulty']:.6f}")
    
    print(f"\n复合难度之和: {difficulty1:.6f}")
    print(f"复合难占比: {ratio1:.6f}")
    print()
    
    # 测试2: 演示子数组分割
    print("测试2: 演示子数组分割")
    an2 = [50, 120, 80, 150, 90, 110, 130, 70, 140, 85, 95, 105, 115, 125, 135, 145, 155, 165, 175, 185]
    bn2 = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1]
    T2 = 100
    
    difficulty2, ratio2, marks2, hand_change2, sync2, sub_arrays2 = calculate_composite_difficulty(an2, bn2, T2)
    
    print(f"an数组长度: {len(an2)}")
    print(f"T值: {T2}")
    print(f"标记序列: {' '.join(marks2)}")
    
    # 分析子数组
    print(f"\n子数组分析:")
    for i, sub in enumerate(sub_arrays2):
        print(f"  子数组{i+1}:")
        print(f"    位置: 索引[{sub['start']}]-[{sub['end']}]，长度={sub['length']}")
        print(f"    标记: {' '.join(sub['marks'])}")
        print(f"    难度: {sub['difficulty']:.6f}")
    
    print(f"\n复合难度之和: {difficulty2:.6f}")
    print(f"复合难占比: {ratio2:.6f}")
    print()
    
    # 测试3: 演示加权几何平均计算
    print("测试3: 演示加权几何平均计算")
    an3 = [120, 140, 160, 180, 200]
    bn3 = [1, 2, 1, 2, 1, 2]
    
    print(f"an数组: {an3}")
    print(f"bn数组: {bn3}")
    
    result3, ratio3, T_used3, marks3, hand_change3, sync3, sub_arrays3 = compute_final_composite_difficulty(an3, bn3)
    print(f"最终复合难度之和: {result3:.6f}")
    print(f"最终复合难占比: {ratio3:.6f}")
    print(f"使用的T值: {T_used3}")


# 演示标记规则
def explain_marking_rules():
    """演示标记规则"""
    print("标记规则演示")
    print("=" * 60)
    print("标记规则：")
    print("1. a0标记为'R'")
    print("2. 对于ai(i>=1):")
    print("   - 如果a(i-1)标记为'R'且a(i-1)<T，则ai标记为'L'")
    print("   - 否则标记为'R'")
    print()
    print("子数组提取规则：")
    print("1. 从数组第一个元素（标记为R）开始")
    print("2. 按顺序提取元素形成子数组，要求标记模式为RLRLRL...循环")
    print("3. 当遇到连续两个R标记时，结束当前子数组")
    print("4. 子数组长度必须≥6才参与计算")
    print("5. 从子数组的末尾对应到原数组的下一个元素开始重复上述过程")
    print()
    print("基础系数计算新规则：")
    print("1. 从子数组的第6个元素开始观察")
    print("2. 比较当前观察元素与上一个元素的同步标记")
    print("3. 若同步标记不同，基础系数=1，否则=0")
    print()
    print("复合难度计算：")
    print("1. 对每个子数组从第6个元素开始计算难度")
    print("2. 子数组难度 = Σ(a_coeff * b_coeff)")
    print("3. 最终子数组难度 = 子数组难度 * ln(子数组长度)")
    print("4. 总难度 = 所有子数组难度之和")
    print()


# 演示加权几何平均计算
def explain_weighted_geometric():
    """演示加权几何平均计算"""
    print("加权几何平均计算演示")
    print("=" * 60)
    print("权重计算公式：weight = 1/B - 1/A")
    print("其中A和B是相邻的T值")
    print("最后一个权重：weight = 1/tm - 1/tn")
    print("所有权重之和：sum(weights) = 1/tm - 1/t0")
    print()
    print("加权几何平均值计算公式：")
    print("exp(∑(w_i * log(difficulty_i)) / ∑w_i)")
    print("其中w_i是权重，difficulty_i是对应的复合难度")
    print()
    print("注意：")
    print("1. 加权几何平均值要求所有difficulty_i > 0")
    print("2. 如果任意difficulty_i <= 0，加权几何平均值=0")
    print("3. 如果权重总和<=0，使用第一个难度值")
    print()


if __name__ == "__main__":
    # 演示标记规则
    explain_marking_rules()
    
    # 演示加权几何平均计算
    explain_weighted_geometric()
    
    # 运行测试
    test_composite_difficulty()
    
    # 创建一个简单的交互式测试
    print("\n" + "=" * 60)
    print("简单交互测试")
    print("=" * 60)
    
    # 使用固定的测试数据
    an_test = [50, 120, 80, 150, 90, 110, 130, 70, 140, 85, 95, 105, 115, 125, 135, 145, 155, 165, 175, 185]
    bn_test = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1]
    
    print(f"测试数据：")
    print(f"an = {an_test}")
    print(f"bn长度: {len(bn_test)} (应为{len(an_test)+1})")
    
    try:
        result, ratio, T_used, marks, hand_change, sync, sub_arrays = compute_final_composite_difficulty(an_test, bn_test)
        
        print(f"\n计算结果：")
        print(f"最终复合难度之和: {result:.6f}")
        print(f"最终复合难占比: {ratio:.6f}")
        print(f"使用的T值: {T_used}")
        print(f"L/R标记: {' '.join(marks)}")
        print(f"\n子数组信息:")
        for i, sub in enumerate(sub_arrays):
            print(f"  子数组{i+1}: 长度={sub['length']}, 标记={' '.join(sub['marks'])}, 难度={sub['difficulty']:.6f}")
        
    except Exception as e:
        print(f"计算错误: {e}")
        import traceback
        traceback.print_exc()